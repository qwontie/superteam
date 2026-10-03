import asyncio
import json
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError
from pydantic_ai import Agent, UnexpectedModelBehavior
from pydantic_ai.exceptions import ModelAPIError, UserError
from pydantic_ai.messages import TextPart
from pydantic_core import from_json

from services.llm import Llm
from utils.env import env
from utils.logging import logger

from .agent import DealContext, deal_agent
from .errors import DealError, ai_failed, ai_unavailable, timed_out
from .model_io import (
    ConversionError,
    ModelCheck,
    ModelRule,
    ModelSlot,
    check_data,
    rule_data,
    slot_data,
    sol_to_lamports,
)
from .service import respond

Payload = dict[str, Any]


def sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _draft(text: str) -> Payload:
    try:
        parsed = from_json(text, allow_partial=True)
    except ValueError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    result = parsed.get("result")
    if not isinstance(result, dict) or result.get("kind") != "ModelDraft":
        return {}
    data = result.get("data")
    return data if isinstance(data, dict) else {}


def _complete(data: Payload, key: str, after: str | None) -> list[Any]:
    items = data.get(key)
    if not isinstance(items, list):
        return []
    return items if after is not None and after in data else items[:-1]


@dataclass
class Emitter:
    ctx: DealContext
    parties: int = 0
    meta: bool = False
    checks: int = 0
    rules: int = 0

    def pieces(self, data: Payload) -> list[str]:
        out: list[str] = []
        for raw in _complete(data, "parties", "funder")[self.parties :]:
            slot = _convert(lambda r=raw: self._slot(r))
            if slot is None:
                break
            out.append(sse("party", {"index": self.parties, "slot": slot}))
            self.parties += 1
        if not self.meta and "checks" in data:
            self.meta = True
            out.append(sse("meta", self._meta(data)))
        for raw in _complete(data, "checks", "rules")[self.checks :]:
            check = _convert(lambda r=raw: self._check(r))
            if check is None:
                break
            out.append(sse("check", {"index": self.checks, "check": check}))
            self.checks += 1
        for raw in _complete(data, "rules", "questions")[self.rules :]:
            rule = _convert(
                lambda r=raw: rule_data(ModelRule.model_validate(r), self.ctx.zone)
            )
            if rule is None:
                break
            out.append(sse("rule", {"index": self.rules, "rule": rule}))
            self.rules += 1
        return out

    def _slot(self, raw: object) -> Payload:
        slot = slot_data(ModelSlot.model_validate(raw))
        if slot["address"] not in self.ctx.allowed:
            slot["address"] = None
        return slot

    def _check(self, raw: object) -> Payload:
        check = check_data(ModelCheck.model_validate(raw))
        check["witnesses"] = [self._slot(w) for w in check["witnesses"]]  # ty: ignore[not-iterable]
        return check

    def _meta(self, data: Payload) -> Payload:
        amount = data.get("amount_sol")
        try:
            lamports = sol_to_lamports(amount) if isinstance(amount, str) else None
        except ConversionError:
            lamports = None
        return {
            "title": str(data.get("title", "")).strip(),
            "funder": data.get("funder"),
            "amount": lamports,
        }


def _convert(build: Callable[[], Payload]) -> Payload | None:
    try:
        return build()
    except (ValidationError, ConversionError):
        return None


async def _attempts(prompt: str, ctx: DealContext, llm: Llm) -> AsyncIterator[str]:
    attempt = 0
    async with deal_agent.iter(
        prompt,
        deps=ctx,
        model=llm.model,
        model_settings=llm.settings,
        retries=env.llm.retries,
    ) as run:
        async for node in run:
            if not Agent.is_model_request_node(node):
                continue
            attempt += 1
            if attempt > 1:
                yield sse("reset", {})
            emitter = Emitter(ctx)
            async with node.stream(run.ctx) as stream:
                async for _event in stream:
                    parts = stream.response.parts
                    text = "".join(p.content for p in parts if isinstance(p, TextPart))
                    for piece in emitter.pieces(_draft(text)):
                        yield piece
        if run.result is None:
            raise ai_failed()
        response = respond(run.result.output, ctx)
    for i, question in enumerate(response.questions):
        yield sse("question", {"index": i, "text": question})
    yield sse("done", response.model_dump(mode="json"))


async def stream_deal(prompt: str, ctx: DealContext, llm: Llm) -> AsyncIterator[str]:
    try:
        async with asyncio.timeout(env.api.timeout_seconds):
            async for piece in _attempts(prompt, ctx, llm):
                yield piece
    except TimeoutError:
        yield _error(timed_out())
    except UnexpectedModelBehavior as e:
        logger.warning("deal stream failed validation: %s", e)
        yield _error(ai_failed())
    except (ModelAPIError, UserError) as e:
        logger.warning("deal stream provider error: %s", type(e).__name__)
        yield _error(ai_unavailable())
    except DealError as e:
        yield _error(e)


def _error(error: DealError) -> str:
    return sse("error", {"code": error.code, "message": error.message})
