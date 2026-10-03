from dishka import make_async_container
from dishka.integrations.fastapi import FastapiProvider

from dependencies.providers.limits import LimitsProvider
from dependencies.providers.llm import LlmProvider

container = make_async_container(LlmProvider(), LimitsProvider(), FastapiProvider())
