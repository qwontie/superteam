import os

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Section(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")


class LogSettings(Section):
    level: str = "INFO"
    level_external: str = "WARNING"
    show_time: bool = False
    console_width: int = 150


class ApiSettings(Section):
    host: str = "0.0.0.0"  # noqa: S104
    port: int = 8000
    workers: int = 1
    docs: bool = False
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    max_body_bytes: int = 16 * 1024
    timeout_seconds: float = 45.0
    rate_per_wallet: int = 10
    rate_per_ip: int = 30
    rate_window_seconds: float = 60.0


class LlmSettings(Section):
    model: str = "google:gemini-3.5-flash"
    gemini_api_key: SecretStr = SecretStr("")
    temperature: float = 0.0
    thinking_level: str | None = "minimal"
    thinking_budget: int | None = None
    retries: int = 3


class Settings(BaseSettings):
    log: LogSettings = Field(default_factory=LogSettings)
    api: ApiSettings = Field(default_factory=ApiSettings)
    llm: LlmSettings = Field(default_factory=LlmSettings)
    gemini_api_key: SecretStr = SecretStr("")

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_file=("../.env", ".env", os.environ.get("PACT_ENV_FILE", "")),
        env_nested_delimiter="__",
        extra="ignore",
    )

    def gemini_key(self) -> str:
        return (self.llm.gemini_api_key or self.gemini_api_key).get_secret_value()


env = Settings()
