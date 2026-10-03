import re

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
INDEX = {c: i for i, c in enumerate(ALPHABET)}
KEY_BYTES = 32
CANDIDATE = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}")


def decode(value: str) -> bytes | None:
    number = 0
    for char in value:
        digit = INDEX.get(char)
        if digit is None:
            return None
        number = number * 58 + digit
    zeros = len(value) - len(value.lstrip("1"))
    body = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    return b"\0" * zeros + body


def is_address(value: str) -> bool:
    if not 32 <= len(value) <= 44:  # noqa: PLR2004
        return False
    raw = decode(value)
    return raw is not None and len(raw) == KEY_BYTES


def addresses_in(text: str) -> set[str]:
    return {m for m in CANDIDATE.findall(text) if is_address(m)}


def encode(raw: bytes) -> str:
    number = int.from_bytes(raw, "big")
    out = ""
    while number:
        number, digit = divmod(number, 58)
        out = ALPHABET[digit] + out
    zeros = len(raw) - len(raw.lstrip(b"\0"))
    return "1" * zeros + out
