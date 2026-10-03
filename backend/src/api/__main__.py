import uvicorn

from utils.env import env


def main() -> None:
    uvicorn.run(
        "api.app:app",
        host=env.api.host,
        port=env.api.port,
        workers=env.api.workers,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
