from collections.abc import Callable

from dishka import FromDishka, Scope
from dishka.integrations.base import wrap_injection

from dependencies.container import container


def inject[**P, T](
    _func: Callable[P, T] | None = None, *, scope: Scope | None = None
) -> Callable[P, T] | Callable[[Callable[P, T]], Callable[P, T]]:
    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        return wrap_injection(
            func=func,
            is_async=True,
            container_getter=lambda _args, _kwargs: container,
            scope=scope,
        )

    if _func is None:
        return decorator
    return decorator(_func)


__all__ = ["FromDishka", "Scope", "container", "inject"]
