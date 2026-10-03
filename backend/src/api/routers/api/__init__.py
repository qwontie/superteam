from fastapi import APIRouter

from . import ai, health

router = APIRouter()
router.include_router(health.router, prefix="/health")
router.include_router(ai.router, prefix="/ai")
