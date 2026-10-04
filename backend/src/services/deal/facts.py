import re
import secrets
from urllib.parse import urlsplit

ORACLE_LABEL = "Switchboard oracles"
DEMO_NODES = (
    "3LsndN1YHY4stDPH3Mzm3SMG86tEe2ifseCohiiB7XgY",
    "8MuJTQ8H6vbpB7aYZCMHFba4XMq9dxnVuyVgi9CMyJCk",
    "wNrW7RVE5KtChXRNNpBHEHMe9Nd1eEKuaVB2zvYrD95",
)
DEMO_THRESHOLD = 2
PRICE_PAIRS = ("SOL-USD", "BTC-USD", "ETH-USD")
WIKIDATA_PROPERTIES = {
    "P570": "date of death",
    "P569": "date of birth",
    "P576": "dissolution date",
    "P1082": "population",
    "P1128": "employee count",
}
QUANTITIES = frozenset({"P1082", "P1128"})
ENTITY = re.compile(r"^Q[1-9]\d*$")
WIKIDATA = re.compile(r"^wikidata:(Q[1-9]\d*)/(P[1-9]\d*)$")
PRICE = re.compile(r"^price:([A-Z]+-[A-Z]+)$")
NUMBER = re.compile(r"^-?\d+(\.\d+)?$")
URL = re.compile(r"^https://[^\s#]+(#\S*)?$")
JSON_PATH = re.compile(r"^(?:[\w-]+|\[\d+\])(?:\.[\w-]+|\[\d+\])*$")
MIN_PHRASE = 16
MIN_WORDS = 3


SlotData = dict[str, str | bool | None]


def checked_by(kind: str, binds: int | None) -> tuple[list[SlotData], int]:
    if kind == "http_contains" and binds is None:
        return [{"label": ORACLE_LABEL, "address": None, "open": False}], 1
    nodes: list[SlotData] = [
        {"label": f"Node {i}", "address": a, "open": False}
        for i, a in enumerate(DEMO_NODES, 1)
    ]
    return nodes, DEMO_THRESHOLD


def new_marker() -> str:
    return f"pact-{secrets.randbelow(900_000) + 100_000}"


def is_page(target: str) -> bool:
    return URL.match(target) is not None and "#" not in target


def _compare(expect: str, ops: str) -> str | None:
    op, value = expect[:1], expect[1:]
    if op in "<>" and op in ops and NUMBER.match(value):
        return None
    return f"expect must be one of {', '.join(f'{o}number' for o in ops)}"


def _value(expect: str) -> str | None:
    if (expect[:1] in "=~" and expect[1:]) or _compare(expect, "<>") is None:
        return None
    return "an API value is checked with =value, ~text, >number or <number"


def _wikidata(expect: str) -> str | None:
    item = expect.startswith("=") and ENTITY.match(expect[1:]) is not None
    if expect == "exists" or item or _compare(expect, "<>") is None:
        return None
    return "expect must be exists, =Q.., >number or <number"


def wikidata_policy(target: str, expect: str) -> str | None:
    match = WIKIDATA.match(target)
    if match is None:
        return None
    prop = match.group(2)
    if prop not in WIKIDATA_PROPERTIES:
        allowed = ", ".join(f"{p} {n}" for p, n in WIKIDATA_PROPERTIES.items())
        return f"wikidata property {prop} is not allowed, use one of {allowed}"
    if prop in QUANTITIES:
        return _compare(expect, "><")
    return None if expect == "exists" else "expect must be exists for a date"


def _price(match: re.Match[str], expect: str) -> str | None:
    if match.group(1) not in PRICE_PAIRS:
        return f"price pair must be one of {', '.join(PRICE_PAIRS)}"
    return _compare(expect, "><")


def fact_problem(target: str, expect: str) -> str | None:
    if WIKIDATA.match(target):
        return _wikidata(expect)
    if match := PRICE.match(target):
        return _price(match, expect)
    if not URL.match(target):
        return "target must be an https:// URL, price:PAIR or wikidata:Q../P.."
    if is_page(target):
        return None if expect else "expect must be the text the page must contain"
    if not JSON_PATH.match(target.split("#", 1)[1]):
        return "the JSON path after # must be dotted keys with [n] indexes"
    return _value(expect)


def entity_of(target: str) -> str | None:
    match = WIKIDATA.match(target)
    return match.group(1) if match else None


def _bare(value: str) -> str:
    parts = urlsplit(value.strip())
    rest = f"{parts.netloc}{parts.path}".removeprefix("www.").rstrip("/")
    return f"{rest}?{parts.query}" if parts.query else rest


def url_named(target: str, text: str) -> bool:
    if not URL.match(target):
        return True
    bare = _bare(target.split("#", 1)[0]).lower()
    return bool(bare) and bare in text.lower()


def repo_named(target: str, text: str) -> bool:
    repo, _, ref = target.replace("@", "#", 1).partition("#")
    lowered = text.lower()
    return repo.lower() in lowered and ref.lower() in lowered


def distinctive(phrase: str) -> bool:
    if any(c.isdigit() for c in phrase):
        return True
    return len(phrase.split()) >= MIN_WORDS or len(phrase) >= MIN_PHRASE
