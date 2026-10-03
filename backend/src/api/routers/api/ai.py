from dishka.integrations.fastapi import FromDishka, inject
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.access.proof import WalletProof
from services.access.quota import Access, Grant, Quota
from services.deal.errors import DealError
from services.deal.schemas import DealDraftRequest, DealDraftResponse
from services.deal.service import draft_deal, prepare
from services.deal.stream import Billing, stream_deal
from services.llm import Llm

router = APIRouter(tags=["ai"])


class QuotaRequest(BaseModel):
    wallet: str | None = Field(default=None, max_length=64)
    proof: WalletProof | None = None


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def admit(request: Request, body: DealDraftRequest, access: Access) -> Grant:
    grant = await access.grant(client_ip(request), body.wallet, body.proof)
    access.throttle(grant)
    return grant


@router.post("/deal")
@inject
async def deal(
    request: Request,
    body: DealDraftRequest,
    llm: FromDishka[Llm],
    access: FromDishka[Access],
) -> DealDraftResponse:
    grant = await admit(request, body, access)
    ctx, prompt = prepare(body)
    access.consume(grant)
    try:
        response = await draft_deal(ctx, prompt, llm)
    except DealError as e:
        if e.status >= 500:  # noqa: PLR2004
            access.refund(grant)
        raise
    return response.model_copy(update={"quota": access.quota(grant)})


@router.post("/deal/stream")
@inject
async def deal_stream(
    request: Request,
    body: DealDraftRequest,
    llm: FromDishka[Llm],
    access: FromDishka[Access],
) -> StreamingResponse:
    grant = await admit(request, body, access)
    ctx, prompt = prepare(body)
    access.consume(grant)
    billing = Billing(
        quota=lambda: access.quota(grant), refund=lambda: access.refund(grant)
    )
    return StreamingResponse(
        stream_deal(prompt, ctx, llm, billing),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/quota")
@inject
async def quota(
    request: Request, body: QuotaRequest, access: FromDishka[Access]
) -> Quota:
    grant = await access.grant(client_ip(request), body.wallet, body.proof)
    return access.quota(grant)
