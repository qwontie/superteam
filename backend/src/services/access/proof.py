import base64
import binascii
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import BaseModel, Field

from services.deal.addresses import decode
from services.deal.errors import DealError
from utils.env import env

HEADER = "Pact AI access"
FUTURE_SKEW = 300
BAD_FORMAT = "unexpected message format"
OTHER_WALLET = "message is for another wallet"
BAD_ISSUED = "issued time is not a number"
FROM_FUTURE = "issued in the future"
EXPIRED = "expired, sign a new one"
NOT_BASE64 = "signature is not base64"
BAD_SIGNATURE = "signature does not match the wallet"


class WalletProof(BaseModel):
    message: str = Field(max_length=200)
    signature: str = Field(max_length=200)


def proof_message(wallet: str, issued: int) -> str:
    return f"{HEADER}\nWallet: {wallet}\nIssued: {issued}"


def bad_proof(reason: str) -> DealError:
    return DealError(401, "bad_proof", f"Wallet proof rejected: {reason}.")


def _issued(message: str, wallet: str) -> int:
    lines = message.split("\n")
    if len(lines) != 3 or lines[0] != HEADER:  # noqa: PLR2004
        raise bad_proof(BAD_FORMAT)
    if lines[1] != f"Wallet: {wallet}":
        raise bad_proof(OTHER_WALLET)
    issued = lines[2].removeprefix("Issued: ")
    if not issued.isdigit():
        raise bad_proof(BAD_ISSUED)
    return int(issued)


def verify_proof(proof: WalletProof, wallet: str) -> None:
    issued = _issued(proof.message, wallet)
    now = int(time.time())
    if issued > now + FUTURE_SKEW:
        raise bad_proof(FROM_FUTURE)
    if issued < now - env.access.proof_max_age_seconds:
        raise bad_proof(EXPIRED)
    try:
        signature = base64.b64decode(proof.signature, validate=True)
    except (binascii.Error, ValueError) as e:
        raise bad_proof(NOT_BASE64) from e
    key = decode(wallet) or b""
    try:
        Ed25519PublicKey.from_public_bytes(key).verify(
            signature, proof.message.encode()
        )
    except (InvalidSignature, ValueError) as e:
        raise bad_proof(BAD_SIGNATURE) from e
