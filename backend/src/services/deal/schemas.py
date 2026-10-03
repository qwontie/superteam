from dataclasses import dataclass, field
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, BaseModel, Field, ValidationInfo, model_validator

from .addresses import is_address

TITLE_MAX_BYTES = 48
TARGET_MAX_BYTES = 128
EXPECT_MAX_BYTES = 64
LABEL_MAX = 40
SUMMARY_MAX = 200
QUESTION_MAX = 200
QUESTIONS_MAX = 5
BPS_TOTAL = 10_000
U64_MAX = 2**64 - 1
CHECKS_BASE = 2
CHECKS_OPEN = 3
MAX_HORIZON_SECONDS = 5 * 365 * 24 * 3600


class Slot(BaseModel):
    label: str = Field(min_length=1, max_length=LABEL_MAX)
    address: str | None = None
    open: bool = False


class After(BaseModel):
    type: Literal["after"]
    ts: int


class Signed(BaseModel):
    type: Literal["signed"]
    party: int = Field(ge=0)


class Unsigned(BaseModel):
    type: Literal["unsigned"]
    party: int = Field(ge=0)


class Attested(BaseModel):
    type: Literal["attested"]
    check: int = Field(ge=0)


Condition = Annotated[After | Signed | Unsigned | Attested, Field(discriminator="type")]


class Payout(BaseModel):
    party: int = Field(ge=0)
    bps: int = Field(ge=1, le=BPS_TOTAL)


class Check(BaseModel):
    kind: Literal["manual"] = "manual"
    target: str = Field(min_length=1)
    expect: str = ""
    witnesses: list[Slot] = Field(min_length=1, max_length=5)
    threshold: int = Field(ge=1)
    binds: int | None = Field(default=None, ge=0)


class Rule(BaseModel):
    when: list[Condition] = Field(min_length=1, max_length=4)
    pay: list[Payout] = Field(min_length=1, max_length=4)
    summary: str = Field(default="", max_length=SUMMARY_MAX)


@dataclass(frozen=True, slots=True)
class Strict:
    now: int
    allowed: frozenset[str] = field(default_factory=frozenset)
    open_recipient: bool = False


def _byte_len(value: str) -> int:
    return len(value.encode())


def _slot_problems(slots: list[Slot], where: str, allowed: frozenset[str]) -> list[str]:
    problems: list[str] = []
    seen: set[str] = set()
    for i, slot in enumerate(slots):
        if slot.address is None:
            continue
        if not is_address(slot.address):
            problems.append(f"{where}[{i}].address is not a valid Solana address")
        elif slot.address not in allowed:
            problems.append(
                f"{where}[{i}].address {slot.address} does not appear in the request"
                " or the caller wallet: use null"
            )
        if slot.address in seen:
            problems.append(f"{where}[{i}].address is used twice")
        seen.add(slot.address)
    return problems


class DealDraft(BaseModel):
    title: str = Field(min_length=1)
    parties: list[Slot] = Field(min_length=2, max_length=4)
    funder: int = Field(ge=0)
    amount: str | None = Field(default=None, pattern=r"^[1-9][0-9]{0,19}$")
    checks: list[Check] = Field(default_factory=list, max_length=CHECKS_OPEN)
    rules: list[Rule] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def invariants(self, info: ValidationInfo) -> Self:
        strict = info.context if isinstance(info.context, Strict) else None
        if strict is None:
            return self
        problems = self.problems(strict)
        if problems:
            raise ValueError("; ".join(problems))
        return self

    def problems(self, strict: Strict) -> list[str]:
        problems: list[str] = []
        if _byte_len(self.title) > TITLE_MAX_BYTES:
            problems.append(f"title is longer than {TITLE_MAX_BYTES} bytes")
        if self.funder >= len(self.parties):
            problems.append("funder is not a party index")
        if self.amount is not None and int(self.amount) > U64_MAX:
            problems.append("amount does not fit in u64")
        max_checks = CHECKS_OPEN if strict.open_recipient else CHECKS_BASE
        if len(self.checks) > max_checks:
            problems.append(f"at most {max_checks} checks")
        problems += _slot_problems(self.parties, "parties", strict.allowed)
        for c, check in enumerate(self.checks):
            problems += self._check_problems(c, check, strict.allowed)
        has_exit = False
        for r, rule in enumerate(self.rules):
            problems += self._rule_problems(r, rule, strict.now)
            has_exit = has_exit or all(isinstance(w, After) for w in rule.when)
        if not has_exit:
            problems.append(
                "no exit rule: at least one rule must have only after conditions"
            )
        problems += self._open_problems(strict.open_recipient)
        return problems

    def _open_problems(self, enabled: bool) -> list[str]:  # noqa: FBT001
        open_slots = {i for i, p in enumerate(self.parties) if p.open}
        binders = [c.binds for c in self.checks if c.binds is not None]
        if not enabled:
            off = (
                "open recipients are not available: use a normal party with"
                " address null and no binds"
            )
            return [off] if open_slots or binders else []
        problems: list[str] = []
        if self.funder in open_slots:
            problems.append("the funder cannot be an open slot")
        for i in open_slots:
            if self.parties[i].address is not None:
                problems.append(f"parties[{i}] is open, its address must be null")
            if binders.count(i) != 1:
                problems.append(
                    f"parties[{i}] is open and needs exactly one binding check"
                )
        for c, check in enumerate(self.checks):
            if check.binds is not None and check.binds not in open_slots:
                problems.append(f"checks[{c}].binds must point to an open party")
            if any(w.open for w in check.witnesses):
                problems.append(f"checks[{c}] witnesses cannot be open slots")
        return problems + self._open_payout_problems(open_slots)

    def _open_payout_problems(self, open_slots: set[int]) -> list[str]:
        binding = {
            party: {c for c, check in enumerate(self.checks) if check.binds == party}
            for party in open_slots
        }
        problems: list[str] = []
        for r, rule in enumerate(self.rules):
            attested = {c.check for c in rule.when if isinstance(c, Attested)}
            problems += [
                f"rules[{r}] pays open parties[{p.party}] without attested of the"
                " check that binds it"
                for p in rule.pay
                if p.party in open_slots and not binding[p.party] & attested
            ]
        return problems

    @staticmethod
    def _check_problems(c: int, check: Check, allowed: frozenset[str]) -> list[str]:
        problems: list[str] = []
        if _byte_len(check.target) > TARGET_MAX_BYTES:
            problems.append(
                f"checks[{c}].target is longer than {TARGET_MAX_BYTES} bytes"
            )
        if check.expect:
            problems.append(f"checks[{c}].expect must be empty for a manual check")
        if check.threshold > len(check.witnesses):
            problems.append(f"checks[{c}].threshold is above the number of witnesses")
        problems += _slot_problems(check.witnesses, f"checks[{c}].witnesses", allowed)
        return problems

    def _rule_problems(self, r: int, rule: Rule, now: int) -> list[str]:
        problems: list[str] = []
        for w, cond in enumerate(rule.when):
            where = f"rules[{r}].when[{w}]"
            match cond:
                case After(ts=ts) if ts <= now:
                    problems.append(f"{where} time is not in the future")
                case After(ts=ts) if ts > now + MAX_HORIZON_SECONDS:
                    problems.append(f"{where} time is more than 5 years away")
                case Signed(party=p) | Unsigned(party=p) if p >= len(self.parties):
                    problems.append(f"{where}.party is out of range")
                case Attested(check=c) if c >= len(self.checks):
                    problems.append(f"{where}.check is out of range")
                case _:
                    pass
        total = sum(p.bps for p in rule.pay)
        if total != BPS_TOTAL:
            problems.append(f"rules[{r}].pay shares sum to {total}, not {BPS_TOTAL}")
        parties = [p.party for p in rule.pay]
        if len(set(parties)) != len(parties):
            problems.append(f"rules[{r}].pay names a party twice")
        if any(p >= len(self.parties) for p in parties):
            problems.append(f"rules[{r}].pay.party is out of range")
        return problems


def _address(value: str) -> str:
    if not is_address(value):
        msg = "not a valid Solana address"
        raise ValueError(msg)
    return value


class DealDraftRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    wallet: Annotated[str, AfterValidator(_address)] | None = None
    now: int
    timezone: str = Field(min_length=1, max_length=64)
    draft: DealDraft | None = None


class DealDraftResponse(BaseModel):
    draft: DealDraft
    questions: list[Annotated[str, Field(max_length=QUESTION_MAX)]] = Field(
        default_factory=list, max_length=QUESTIONS_MAX
    )
