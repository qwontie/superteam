import asyncio
from typing import Any

import httpx
from pydantic import BaseModel

from utils.logging import logger

from .facts import WIKIDATA_PROPERTIES

API = "https://www.wikidata.org/w/api.php"
HEADERS = {"User-Agent": "Pact/1.0 (https://pact.qwontie.dev; deal drafting)"}
TIMEOUT = 6.0
LIMIT = 6
CLAIMS = 3
ATTEMPTS = 3
BACKOFF = 1.0
RETRY_ON = frozenset({429, 500, 502, 503, 504})
GATE = asyncio.Semaphore(4)


class Candidate(BaseModel):
    id: str
    label: str
    description: str
    has_value: bool | None
    value: str | None


async def _get(client: httpx.AsyncClient, params: dict[str, str]) -> dict[str, Any]:
    for attempt in range(ATTEMPTS):
        async with GATE:
            response = await client.get(API, params={**params, "format": "json"})
        if response.status_code not in RETRY_ON or attempt == ATTEMPTS - 1:
            break
        await asyncio.sleep(BACKOFF * (attempt + 1))
    if response.is_error:
        logger.warning("wikidata answered %d", response.status_code)
    response.raise_for_status()
    return response.json()


def _first_value(claims: dict[str, Any], prop: str) -> tuple[bool, str | None]:
    found = claims.get(prop) or []
    for claim in found:
        snak = claim.get("mainsnak", {})
        if snak.get("snaktype") != "value":
            continue
        value = snak.get("datavalue", {}).get("value")
        if isinstance(value, dict):
            value = value.get("time") or value.get("id") or value.get("amount")
        return True, str(value) if value is not None else None
    return False, None


async def _claims(
    client: httpx.AsyncClient, entity: str, prop: str
) -> tuple[bool | None, str | None]:
    try:
        data = await _get(
            client, {"action": "wbgetclaims", "entity": entity, "property": prop}
        )
    except (httpx.HTTPError, ValueError):
        return None, None
    return _first_value(data.get("claims") or {}, prop)


async def _labels(client: httpx.AsyncClient, ids: list[str]) -> dict[str, Any]:
    data = await _get(
        client,
        {
            "action": "wbgetentities",
            "ids": "|".join(ids),
            "props": "labels|descriptions",
            "languages": "en",
            "languagefallback": "1",
        },
    )
    return data.get("entities") or {}


def _text(entity: dict[str, Any], key: str) -> str:
    return str((entity.get(key) or {}).get("en", {}).get("value") or "")


async def search(name: str, prop: str) -> list[Candidate]:
    params = {
        "action": "query",
        "list": "search",
        "srsearch": name,
        "srnamespace": "0",
        "srlimit": str(LIMIT),
        "srprop": "",
    }
    async with httpx.AsyncClient(headers=HEADERS, timeout=TIMEOUT) as client:
        try:
            found = (await _get(client, params)).get("query", {}).get("search") or []
            ids = [str(item["title"]) for item in found if "title" in item]
            entities = await _labels(client, ids) if ids else {}
        except (httpx.HTTPError, ValueError) as e:
            logger.warning("wikidata search failed: %s", type(e).__name__)
            return []
        checked = ids[:CLAIMS] if prop in WIKIDATA_PROPERTIES else []
        known = await asyncio.gather(*(_claims(client, i, prop) for i in checked))
        known += [(None, None)] * (len(ids) - len(checked))
    return [
        Candidate(
            id=i,
            label=_text(entities.get(i, {}), "labels"),
            description=_text(entities.get(i, {}), "descriptions"),
            has_value=has,
            value=value,
        )
        for i, (has, value) in zip(ids, known, strict=True)
    ]
