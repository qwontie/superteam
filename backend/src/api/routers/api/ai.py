from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from services.deal.errors import DealError
from services.deal.schemas import DealDraftRequest, DealDraftResponse
from services.deal.service import draft_deal, prepare
from services.deal.stream import stream_deal
from services.llm import Llm
from services.ratelimit import RateLimiter
from utils.env import env

router = APIRouter(tags=["ai"])


def check_rate(request: Request, body: DealDraftRequest, limiter: RateLimiter) -> None:
    ip = request.client.host if request.client else "unknown"
    waits = [limiter.retry_after(f"ip:{ip}", env.api.rate_per_ip)]
    if body.wallet:
        waits.append(
            limiter.retry_after(f"wallet:{body.wallet}", env.api.rate_per_wallet)
        )
    wait = max(waits)
    if wait:
        msg = f"Too many requests, retry in {wait} s."
        raise DealError(429, "rate_limited", msg, retry_after=wait)


@router.post("/deal")
@inject
async def deal(
    request: Request,
    body: DealDraftRequest,
    llm: FromDishka[Llm],
    limiter: FromDishka[RateLimiter],
) -> DealDraftResponse:
    check_rate(request, body, limiter)
    return await draft_deal(body, llm)


@router.post("/deal/stream")
@inject
async def deal_stream(
    request: Request,
    body: DealDraftRequest,
    llm: FromDishka[Llm],
    limiter: FromDishka[RateLimiter],
) -> StreamingResponse:
    check_rate(request, body, limiter)
    ctx, prompt = prepare(body)
    return StreamingResponse(
        stream_deal(prompt, ctx, llm),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
