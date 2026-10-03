import time
from collections import deque


class RateLimiter:
    def __init__(self, window: float) -> None:
        self.window = window
        self.hits: dict[str, deque[float]] = {}
        self.sweep_at = 0.0

    def retry_after(self, key: str, limit: int) -> int:
        now = time.monotonic()
        self._sweep(now)
        hits = self.hits.setdefault(key, deque())
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= limit:
            return max(1, int(hits[0] + self.window - now) + 1)
        hits.append(now)
        return 0

    def _sweep(self, now: float) -> None:
        if now < self.sweep_at:
            return
        self.sweep_at = now + self.window
        cutoff = now - self.window
        for key in [k for k, v in self.hits.items() if not v or v[-1] <= cutoff]:
            del self.hits[key]
