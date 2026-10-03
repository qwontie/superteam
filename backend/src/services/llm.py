from dataclasses import dataclass

from pydantic_ai.models import Model, infer_model
from pydantic_ai.models.google import GoogleModelSettings
from pydantic_ai.providers import Provider as AiProvider
from pydantic_ai.providers import infer_provider
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.settings import ModelSettings

from utils.env import env

GOOGLE = {"google"}


def _provider(name: str) -> AiProvider:
    if name in GOOGLE:
        return GoogleProvider(api_key=env.gemini_key())
    return infer_provider(name)


def _settings() -> ModelSettings:
    thinking: dict[str, str | int] = {}
    if env.llm.thinking_level:
        thinking["thinking_level"] = env.llm.thinking_level.upper()
    if env.llm.thinking_budget is not None:
        thinking["thinking_budget"] = env.llm.thinking_budget
    if env.llm.model.split(":", 1)[0] in GOOGLE:
        return GoogleModelSettings(
            temperature=env.llm.temperature,
            google_thinking_config=thinking,  # ty: ignore[invalid-argument-type]
        )
    return ModelSettings(temperature=env.llm.temperature)


@dataclass(frozen=True, slots=True)
class Llm:
    model: Model
    settings: ModelSettings


def build_llm() -> Llm:
    return Llm(
        model=infer_model(env.llm.model, provider_factory=_provider),
        settings=_settings(),
    )
