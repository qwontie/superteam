from dishka import Provider, Scope, provide

from services.llm import Llm, build_llm


class LlmProvider(Provider):
    @provide(scope=Scope.APP)
    def llm(self) -> Llm:
        return build_llm()
