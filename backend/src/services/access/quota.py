import time
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel

from services.deal.errors import DealError
from services.ratelimit import RateLimiter
from utils.env import env

from .proof import WalletProof, verify_proof
from .subscription import SubscriptionReader

DAY = 86400


class Quota(BaseModel):
    tier: Literal["free", "pro"]
    verified: bool
    limit: int | None
    remaining: int | None
    resets_at: int | None
    pro_expires_at: int | None


@dataclass(frozen=True, slots=True)
class Grant:
    tier: Literal["free", "pro"]
    ip: str
    wallet: str | None
    verified: bool
    pro_expires_at: int | None

    def daily_keys(self) -> list[tuple[str, int]]:
        keys = [(f"ip:{self.ip}", env.access.free_daily_per_ip)]
        if self.wallet:
            scope = "wallet" if self.verified else "claimed"
            keys.append((f"{scope}:{self.wallet}", env.access.free_daily))
        return keys


@dataclass
class DailyCounter:
    counts: dict[str, int] = field(default_factory=dict)
    day: int = 0

    def _roll(self) -> None:
        today = int(time.time()) // DAY
        if today != self.day:
            self.day = today
            self.counts.clear()

    def used(self, key: str) -> int:
        self._roll()
        return self.counts.get(key, 0)

    def add(self, key: str, delta: int) -> None:
        self._roll()
        self.counts[key] = max(0, self.counts.get(key, 0) + delta)

    def resets_at(self) -> int:
        self._roll()
        return (self.day + 1) * DAY


def quota_exhausted() -> DealError:
    return DealError(
        402,
        "quota_exhausted",
        "Free AI drafts for today are used up. Go Pro for unlimited drafts, or build"
        " the deal by hand.",
    )


class Access:
    def __init__(
        self, limiter: RateLimiter, subs: SubscriptionReader, counter: DailyCounter
    ) -> None:
        self.limiter = limiter
        self.subs = subs
        self.counter = counter

    async def grant(
        self, ip: str, wallet: str | None, proof: WalletProof | None
    ) -> Grant:
        if proof is None or wallet is None:
            if proof is not None:
                raise DealError(422, "bad_request", "A wallet proof needs a wallet.")
            return Grant("free", ip, wallet, verified=False, pro_expires_at=None)
        verify_proof(proof, wallet)
        sub = await self.subs.get(wallet)
        tier = "pro" if sub.active(int(time.time())) else "free"
        return Grant(tier, ip, wallet, verified=True, pro_expires_at=sub.expires_at)

    def throttle(self, grant: Grant) -> None:
        waits = [self.limiter.retry_after(f"ip:{grant.ip}", env.api.rate_per_ip)]
        if grant.wallet:
            limit = (
                env.access.pro_rate_per_minute
                if grant.tier == "pro"
                else env.api.rate_per_wallet
            )
            waits.append(self.limiter.retry_after(f"wallet:{grant.wallet}", limit))
        wait = max(waits)
        if wait:
            msg = f"Too many requests, retry in {wait} s."
            raise DealError(429, "rate_limited", msg, retry_after=wait)

    def quota(self, grant: Grant) -> Quota:
        if grant.tier == "pro":
            return Quota(
                tier="pro",
                verified=grant.verified,
                limit=None,
                remaining=None,
                resets_at=None,
                pro_expires_at=grant.pro_expires_at,
            )
        keys = grant.daily_keys()
        remaining = min(limit - self.counter.used(key) for key, limit in keys)
        return Quota(
            tier="free",
            verified=grant.verified,
            limit=min(limit for _, limit in keys),
            remaining=max(0, remaining),
            resets_at=self.counter.resets_at(),
            pro_expires_at=grant.pro_expires_at,
        )

    def consume(self, grant: Grant) -> None:
        if grant.tier == "pro":
            return
        if self.quota(grant).remaining == 0:
            raise quota_exhausted()
        for key, _ in grant.daily_keys():
            self.counter.add(key, 1)

    def refund(self, grant: Grant) -> None:
        if grant.tier == "pro":
            return
        for key, _ in grant.daily_keys():
            self.counter.add(key, -1)
