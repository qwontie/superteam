from collections.abc import AsyncIterator

import httpx
from dishka import Provider, Scope, provide

from services.access.quota import Access, DailyCounter
from services.access.subscription import SubscriptionReader
from services.ratelimit import RateLimiter
from utils.env import env


class LimitsProvider(Provider):
    @provide(scope=Scope.APP)
    def limiter(self) -> RateLimiter:
        return RateLimiter(env.api.rate_window_seconds)

    @provide(scope=Scope.APP)
    async def http(self) -> AsyncIterator[httpx.AsyncClient]:
        async with httpx.AsyncClient() as client:
            yield client

    @provide(scope=Scope.APP)
    def subscriptions(self, client: httpx.AsyncClient) -> SubscriptionReader:
        return SubscriptionReader(client)

    @provide(scope=Scope.APP)
    def counter(self) -> DailyCounter:
        return DailyCounter()

    @provide(scope=Scope.APP)
    def access(
        self, limiter: RateLimiter, subs: SubscriptionReader, counter: DailyCounter
    ) -> Access:
        return Access(limiter, subs, counter)
