import asyncio
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic_ai import UnexpectedModelBehavior
from pydantic_ai.exceptions import ModelAPIError, UserError

from services.llm import Llm
from utils.env import env
from utils.logging import logger

from .agent import DealContext, build_draft, context_for, deal_agent, prompt_for
from .errors import ai_failed, ai_unavailable, bad_request, not_a_deal, timed_out
from .model_io import ModelDraft, NotADeal
from .schemas import QUESTION_MAX, QUESTIONS_MAX, DealDraftRequest, DealDraftResponse

MAX_CLOCK_SKEW = 24 * 3600


def prepare(request: DealDraftRequest) -> tuple[DealContext, str]:
    try:
        zone = ZoneInfo(request.timezone)
    except (ZoneInfoNotFoundError, ValueError) as e:
        msg = f"unknown time zone {request.timezone!r}"
        raise bad_request(msg) from e
    if abs(request.now - int(time.time())) > MAX_CLOCK_SKEW:
        msg = "now is more than a day away from the server clock"
        raise bad_request(msg)
    ctx = context_for(request, zone)
    return ctx, prompt_for(request, ctx)


def respond(output: ModelDraft | NotADeal, ctx: DealContext) -> DealDraftResponse:
    if isinstance(output, NotADeal):
        raise not_a_deal(output.reason)
    questions = [q.strip()[:QUESTION_MAX] for q in output.questions if q.strip()]
    return DealDraftResponse(
        draft=build_draft(output, ctx), questions=questions[:QUESTIONS_MAX]
    )


async def draft_deal(ctx: DealContext, prompt: str, llm: Llm) -> DealDraftResponse:
    started = time.perf_counter()
    try:
        async with asyncio.timeout(env.api.timeout_seconds):
            result = await deal_agent.run(
                prompt,
                deps=ctx,
                model=llm.model,
                model_settings=llm.settings,
                retries=env.llm.retries,
            )
    except TimeoutError as e:
        raise timed_out() from e
    except UnexpectedModelBehavior as e:
        logger.warning("deal draft failed validation: %s", e)
        raise ai_failed() from e
    except (ModelAPIError, UserError) as e:
        logger.warning("deal draft provider error: %s", type(e).__name__)
        raise ai_unavailable() from e
    logger.info(
        "deal draft in %.1fs, %d requests",
        time.perf_counter() - started,
        result.usage.requests,
    )
    return respond(result.output, ctx)
