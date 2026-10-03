FROM ghcr.io/astral-sh/uv:python3.13-alpine

RUN apk add --no-cache tzdata

WORKDIR /app

ENV PATH="/app/.venv/bin:$PATH" \
    RUN_ENVIRONMENT=prod \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY src ./src
RUN uv sync --frozen --no-dev

ENTRYPOINT ["python", "-m"]
CMD ["api"]
