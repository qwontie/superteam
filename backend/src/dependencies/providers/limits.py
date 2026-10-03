from dishka import Provider, Scope, provide

from services.ratelimit import RateLimiter
from utils.env import env


class LimitsProvider(Provider):
    @provide(scope=Scope.APP)
    def limiter(self) -> RateLimiter:
        return RateLimiter(env.api.rate_window_seconds)
