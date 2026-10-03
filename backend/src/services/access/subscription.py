import hashlib
import time
from dataclasses import dataclass

import httpx

from services.deal.addresses import decode
from services.solana.pda import find_program_address
from services.solana.rpc import RpcError, account_data
from utils.env import env
from utils.logging import logger

DISCRIMINATOR = hashlib.sha256(b"account:Subscription").digest()[:8]
LAYOUT_BYTES = 8 + 32 + 8


@dataclass(frozen=True, slots=True)
class Subscription:
    expires_at: int | None

    def active(self, now: int) -> bool:
        return self.expires_at is not None and self.expires_at > now


def subscription_address(wallet: str) -> str:
    seeds = [b"sub", decode(wallet) or b""]
    return find_program_address(seeds, env.solana.program_id)[0]


def parse(owner: str, data: bytes, wallet: str) -> Subscription:
    if owner != env.solana.program_id or len(data) < LAYOUT_BYTES:
        return Subscription(expires_at=None)
    if data[:8] != DISCRIMINATOR or data[8:40] != decode(wallet):
        return Subscription(expires_at=None)
    return Subscription(expires_at=int.from_bytes(data[40:48], "little", signed=True))


class SubscriptionReader:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client
        self.cache: dict[str, tuple[float, Subscription]] = {}

    async def get(self, wallet: str) -> Subscription:
        now = time.monotonic()
        cached = self.cache.get(wallet)
        if cached and cached[0] > now:
            return cached[1]
        try:
            found = await account_data(self.client, subscription_address(wallet))
        except RpcError as e:
            logger.warning("subscription lookup failed: %s", e)
            return Subscription(expires_at=None)
        sub = parse(*found, wallet) if found else Subscription(expires_at=None)
        self.cache[wallet] = (now + env.solana.cache_seconds, sub)
        return sub
