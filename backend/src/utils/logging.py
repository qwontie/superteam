import logging

from rich.console import Console
from rich.logging import RichHandler
from rich.traceback import install

from .env import env

console = Console(width=env.log.console_width, color_system="auto", force_terminal=True)


def setup_logging() -> None:
    logging.basicConfig(
        level=env.log.level_external,
        format="",
        datefmt=None,
        handlers=[
            RichHandler(
                console=console,
                markup=True,
                rich_tracebacks=True,
                enable_link_path=False,
                tracebacks_show_locals=True,
                omit_repeated_times=False,
                show_time=env.log.show_time,
            )
        ],
    )
    install(console=console, show_locals=True)


logger = logging.getLogger("pact")
logger.setLevel(env.log.level)
