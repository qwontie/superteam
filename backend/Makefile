COMPOSE := cd .. && docker compose
ROOT_ENV := $(shell dirname "$$(git rev-parse --path-format=absolute --git-common-dir)")/.env

.PHONY: fmt check dev build eval

fmt:
	uv run ruff format
	uv run ruff check --fix

check:
	uv run ruff format --check
	uv run ruff check
	uv run ty check

dev:
	PACT_ENV_FILE=$(ROOT_ENV) uv run uvicorn api.app:app --reload --reload-dir src --host 127.0.0.1 --port 8000

build:
	$(COMPOSE) build api

eval:
	PACT_ENV_FILE=$(ROOT_ENV) uv run python scripts/eval.py $(ARGS)
