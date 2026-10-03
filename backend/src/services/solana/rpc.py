import base64

import httpx

from utils.env import env


class RpcError(RuntimeError):
    pass


async def account_data(
    client: httpx.AsyncClient, address: str
) -> tuple[str, bytes] | None:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getAccountInfo",
        "params": [address, {"encoding": "base64", "commitment": "confirmed"}],
    }
    try:
        response = await client.post(env.solana_rpc(), json=payload, timeout=5.0)
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as e:
        msg = f"rpc failed: {type(e).__name__}"
        raise RpcError(msg) from e
    if "error" in body:
        msg = f"rpc error {body['error'].get('code')}"
        raise RpcError(msg)
    value = body.get("result", {}).get("value")
    if value is None:
        return None
    return value["owner"], base64.b64decode(value["data"][0])
