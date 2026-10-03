import hashlib

from services.deal.addresses import decode, encode

P = 2**255 - 19
D = (-121665 * pow(121666, P - 2, P)) % P
PDA_MARKER = b"ProgramDerivedAddress"


def on_curve(point: bytes) -> bool:
    y = int.from_bytes(point, "little") & ((1 << 255) - 1)
    y2 = y * y % P
    u = (y2 - 1) % P
    v = (D * y2 + 1) % P
    if v == 0:
        return u == 0
    ratio = u * pow(v, P - 2, P) % P
    return ratio == 0 or pow(ratio, (P - 1) // 2, P) == 1


def find_program_address(seeds: list[bytes], program_id: str) -> tuple[str, int]:
    program = decode(program_id) or b""
    for bump in range(255, -1, -1):
        digest = hashlib.sha256(
            b"".join(seeds) + bytes([bump]) + program + PDA_MARKER
        ).digest()
        if not on_curve(digest):
            return encode(digest), bump
    msg = "no viable bump"
    raise ValueError(msg)
