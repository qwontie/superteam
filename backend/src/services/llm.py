from dataclasses import dataclass

from pydantic_ai.models import Model, infer_model
from pydantic_ai.models.google import GoogleModelSettings
from pydantic_ai.providers import Provider as AiProvider
from pydantic_ai.providers import infer_provider
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.settings import ModelSettings

from utils.env import LlmSettings, env

GOOGLE = {"google"}


def _provider(name: str) -> AiProvider:
    if name in GOOGLE:
        return GoogleProvider(api_key=env.gemini_key())
    return infer_provider(name)


def _settings(llm: LlmSettings) -> ModelSettings:
    thinking: dict[str, str | int] = {}
    if llm.thinking_level:
        thinking["thinking_level"] = llm.thinking_level.upper()
    if llm.thinking_budget is not None:
        thinking["thinking_budget"] = llm.thinking_budget
    if llm.model.split(":", 1)[0] in GOOGLE:
        return GoogleModelSettings(
            temperature=llm.temperature,
            google_thinking_config=thinking,  # ty: ignore[invalid-argument-type]
        )
    return ModelSettings(temperature=llm.temperature)


@dataclass(frozen=True, slots=True)
class Llm:
    name: str
    model: Model
    settings: ModelSettings


def build_llm(llm: LlmSettings | None = None) -> Llm:
    llm = llm or env.llm
    return Llm(
        name=llm.model,
        model=infer_model(llm.model, provider_factory=_provider),
        settings=_settings(llm),
    )
