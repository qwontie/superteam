class DealError(Exception):
    def __init__(
        self, status: int, code: str, message: str, *, retry_after: int | None = None
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after


def not_a_deal(reason: str) -> DealError:
    return DealError(422, "not_a_deal", reason)


def ai_failed() -> DealError:
    return DealError(502, "ai_failed", "The model could not produce a valid draft.")


def ai_unavailable() -> DealError:
    return DealError(503, "ai_unavailable", "The AI provider is unavailable.")


def timed_out() -> DealError:
    return DealError(504, "timeout", "The AI did not answer in time.")


def bad_request(message: str) -> DealError:
    return DealError(422, "bad_request", message)
