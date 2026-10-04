from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

from .facts import SlotData, checked_by
from .schemas import After, Attested, CheckKind, DealDraft, Signed, Slot, Unsigned

LAMPORTS_PER_SOL = 1_000_000_000
LOCAL_FORMAT = "%Y-%m-%dT%H:%M"


class ModelSlot(BaseModel):
    label: str = Field(
        description="Short English role name, e.g. Client, Freelancer, Reviewer 1"
    )
    address: str | None = Field(
        description=(
            "Solana address copied exactly from the allowed list, otherwise null."
            " Never make one up."
        )
    )
    open: bool = Field(
        default=False,
        description="true only for a recipient unknown at creation (bounty winner)",
    )


class ModelAfter(BaseModel):
    type: Literal["after"]
    at: str = Field(
        description="Local date and time in the caller's time zone, YYYY-MM-DDTHH:MM"
    )


class ModelSigned(BaseModel):
    type: Literal["signed"]
    party: int = Field(description="Index into parties of the party who confirms")


class ModelUnsigned(BaseModel):
    type: Literal["unsigned"]
    party: int = Field(description="Index into parties who has NOT confirmed")


class ModelAttested(BaseModel):
    type: Literal["attested"]
    check: int = Field(description="Index into checks")


ModelCondition = Annotated[
    ModelAfter | ModelSigned | ModelUnsigned | ModelAttested,
    Field(discriminator="type"),
]


class ModelPayout(BaseModel):
    party: int = Field(description="Index into parties")
    bps: int = Field(description="Share in basis points, 10000 is 100%")


class ModelCheck(BaseModel):
    kind: CheckKind = Field(default="manual", description="One of the allowed kinds")
    target: str = Field(
        description=(
            "manual: what the witnesses confirm, plain English, at most 120"
            " characters; http_contains: a page URL, URL#json.path, price:PAIR or"
            " wikidata:Qid/Pid; github_checks: owner/repo@ref; github_pr_merged:"
            " owner/repo#number"
        )
    )
    expect: str = Field(
        default="",
        description="http_contains: page text, or exists, =text, ~text, >N, <N;"
        " github_checks: success; manual and github_pr_merged: empty",
    )
    witnesses: list[ModelSlot] = Field(
        description="manual: 1 to 5 people who vote yes or no; other kinds: []"
    )
    threshold: int = Field(
        description="manual: how many yes votes are needed; other kinds: 1"
    )
    binds: int | None = Field(
        default=None, description="Index of the open party this check picks, else null"
    )


class ModelRule(BaseModel):
    summary: str = Field(
        description="One plain-English sentence: when this happens, who gets what"
    )
    when: list[ModelCondition] = Field(description="1 to 4 conditions, all must hold")
    pay: list[ModelPayout] = Field(description="1 to 4 payouts summing to 10000 bps")


class ModelDraft(BaseModel):
    title: str = Field(description="Short English title, at most 40 characters")
    parties: list[ModelSlot] = Field(description="2 to 4 parties of the deal")
    funder: int = Field(description="Index of the party who deposits the money")
    amount_sol: str | None = Field(
        description=(
            "Deposit in SOL as a decimal string like 1.5, or null when the request"
            " gives no amount in SOL"
        )
    )
    checks: list[ModelCheck] = Field(description="0 to 2 checks")
    rules: list[ModelRule] = Field(
        description="1 to 6 rules in priority order, the exit rule last"
    )
    questions: list[str] = Field(
        description=(
            "0 to 5 short English questions about what the request leaves open"
        )
    )


class NotADeal(BaseModel):
    reason: str = Field(description="One short English sentence why this is not a deal")


class ConversionError(ValueError):
    pass


def local_to_ts(value: str, zone: ZoneInfo) -> int:
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as e:
        msg = f"time {value!r} is not YYYY-MM-DDTHH:MM"
        raise ConversionError(msg) from e
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=zone)
    return int(moment.timestamp())


def ts_to_local(ts: int, zone: ZoneInfo) -> str:
    return datetime.fromtimestamp(ts, zone).strftime(LOCAL_FORMAT)


def sol_to_lamports(value: str) -> str:
    try:
        sol = Decimal(value.strip().replace(",", "."))
    except InvalidOperation as e:
        msg = f"amount_sol {value!r} is not a decimal number"
        raise ConversionError(msg) from e
    lamports = sol * LAMPORTS_PER_SOL
    if sol <= 0 or lamports != lamports.to_integral_value():
        msg = f"amount_sol {value!r} must be positive with at most 9 decimals"
        raise ConversionError(msg)
    return str(int(lamports))


def lamports_to_sol(value: str) -> str:
    sol = Decimal(value) / LAMPORTS_PER_SOL
    return format(sol.normalize(), "f")


def slot_data(slot: ModelSlot) -> SlotData:
    return {
        "label": slot.label.strip(),
        "address": (slot.address or "").strip() or None,
        "open": slot.open,
    }


def _condition(cond: ModelCondition, zone: ZoneInfo) -> dict[str, str | int]:
    match cond:
        case ModelAfter(at=at):
            return {"type": "after", "ts": local_to_ts(at, zone)}
        case ModelSigned(party=p):
            return {"type": "signed", "party": p}
        case ModelUnsigned(party=p):
            return {"type": "unsigned", "party": p}
        case ModelAttested(check=c):
            return {"type": "attested", "check": c}


def check_data(check: ModelCheck) -> dict[str, object]:
    witnesses = [slot_data(w) for w in check.witnesses]
    threshold = check.threshold
    if check.kind != "manual":
        witnesses, threshold = checked_by(check.kind, check.binds)
    return {
        "kind": check.kind,
        "target": check.target.strip(),
        "expect": check.expect.strip(),
        "witnesses": witnesses,
        "threshold": threshold,
        "binds": check.binds,
    }


def rule_data(rule: ModelRule, zone: ZoneInfo) -> dict[str, object]:
    return {
        "summary": rule.summary.strip(),
        "when": [_condition(w, zone) for w in rule.when],
        "pay": [{"party": p.party, "bps": p.bps} for p in rule.pay],
    }


def draft_data(model: ModelDraft, zone: ZoneInfo) -> dict[str, object]:
    return {
        "title": model.title.strip(),
        "parties": [slot_data(s) for s in model.parties],
        "funder": model.funder,
        "amount": sol_to_lamports(model.amount_sol) if model.amount_sol else None,
        "checks": [check_data(c) for c in model.checks],
        "rules": [rule_data(r, zone) for r in model.rules],
    }


def _model_condition(
    cond: After | Signed | Unsigned | Attested, zone: ZoneInfo
) -> ModelCondition:
    match cond:
        case After(ts=ts):
            return ModelAfter(type="after", at=ts_to_local(ts, zone))
        case Signed(party=p):
            return ModelSigned(type="signed", party=p)
        case Unsigned(party=p):
            return ModelUnsigned(type="unsigned", party=p)
        case Attested(check=c):
            return ModelAttested(type="attested", check=c)


def from_draft(draft: DealDraft, zone: ZoneInfo) -> ModelDraft:
    def slot(s: Slot) -> ModelSlot:
        return ModelSlot(label=s.label, address=s.address, open=s.open)

    return ModelDraft(
        title=draft.title,
        parties=[slot(s) for s in draft.parties],
        funder=draft.funder,
        amount_sol=lamports_to_sol(draft.amount) if draft.amount else None,
        checks=[
            ModelCheck(
                kind=c.kind,
                target=c.target,
                expect=c.expect,
                witnesses=[slot(w) for w in c.witnesses],
                threshold=c.threshold,
                binds=c.binds,
            )
            for c in draft.checks
        ],
        rules=[
            ModelRule(
                summary=r.summary,
                when=[_model_condition(w, zone) for w in r.when],
                pay=[ModelPayout(party=p.party, bps=p.bps) for p in r.pay],
            )
            for r in draft.rules
        ],
        questions=[],
    )
