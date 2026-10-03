from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import routers
from api.middlewares.body_limit import BodyLimitMiddleware
from dependencies.container import container
from services.deal.errors import DealError
from utils.env import env
from utils.logging import setup_logging


@asynccontextmanager
async def lifespan(app_: FastAPI) -> AsyncGenerator[None]:
    setup_logging()
    yield
    await app_.state.dishka_container.close()


app = FastAPI(
    title="pact API",
    lifespan=lifespan,
    openapi_url="/openapi.json" if env.api.docs else None,
)


@app.exception_handler(DealError)
async def deal_error(_request: Request, error: DealError) -> JSONResponse:
    headers = {"Retry-After": str(error.retry_after)} if error.retry_after else None
    return JSONResponse(
        {"detail": {"code": error.code, "message": error.message}},
        status_code=error.status,
        headers=headers,
    )


app.add_middleware(BodyLimitMiddleware, max_bytes=env.api.max_body_bytes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=env.api.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

app.include_router(routers.router)

setup_dishka(container, app)
