from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("")
@router.get("/")
async def health() -> dict[str, bool]:
    return {"ok": True}
