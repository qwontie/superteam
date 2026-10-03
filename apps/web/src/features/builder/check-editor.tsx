import { Button, cn, Input, NumberField } from "@cladd-ui/react";
import type { CheckKind } from "@pact/sdk";
import { isAddress } from "@solana/kit";
import { Plus, UserRound, X } from "lucide-react";
import { useCallback } from "react";
import { checkName, partyName } from "@/features/builder/describe";
import {
  addCheck,
  addReviewer,
  canAddCheck,
  canAddReviewer,
  type DraftCheck,
  type DraftCondition,
  hasDemoNodes,
  type PartySlot,
  type Reviewer,
  removeReviewer,
  setCheckKind,
  updateCheck,
  updateCondition,
  withDemoNodes,
} from "@/features/builder/model";
import { Field, ProblemLines, pickedClass } from "@/features/builder/parts";
import { anchors } from "@/features/builder/problems";
import { useBuilder, useDraft } from "@/features/builder/state";

type CheckCondition = Extract<DraftCondition, { type: "attested" }>;

interface PickProps {
  condition: CheckCondition;
  ruleId: string;
}

const KIND_ORDER: CheckKind[] = [
  "manual",
  "http_contains",
  "github_checks",
  "github_pr_merged",
];
const KIND_NAME: Record<CheckKind, string> = {
  github_checks: "GitHub checks",
  github_pr_merged: "PR merged",
  http_contains: "Page contains",
  manual: "People vote",
};
const KIND_HINT: Record<CheckKind, string> = {
  github_checks: "Witness nodes read the GitHub checks of a commit",
  github_pr_merged: "Witness nodes read the state of a pull request",
  http_contains: "Witness nodes open the page and look for the text",
  manual: "The people you name vote from their own wallets",
};
const TARGET_HINT: Record<CheckKind, string> = {
  github_checks: "owner/repo@ref",
  github_pr_merged: "owner/repo#number",
  http_contains: "https://the.page/to/read",
  manual: "What do they confirm?",
};
const TARGET_LABEL: Record<CheckKind, string> = {
  github_checks: "Repository and ref",
  github_pr_merged: "Pull request",
  http_contains: "Page address",
  manual: "What the reviewers confirm",
};
const EXPECT_MAX = 64;
const LABEL_MAX = 40;
const TARGET_MAX = 128;

function KindOption({ check, kind }: { check: DraftCheck; kind: CheckKind }) {
  const { edit } = useBuilder();
  const pick = useCallback(
    () => edit((d) => updateCheck(d, check.id, (c) => setCheckKind(c, kind))),
    [check.id, edit, kind]
  );
  const selected = check.kind === kind;
  return (
    <Button
      aria-pressed={selected}
      className={cn("justify-center", pickedClass(selected))}
      onClick={pick}
      size="lg"
      title={KIND_HINT[kind]}
    >
      {KIND_NAME[kind]}
    </Button>
  );
}

function CheckOption({
  check,
  condition,
  ruleId,
}: PickProps & { check: DraftCheck }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const pick = useCallback(
    () =>
      edit((d) =>
        updateCondition(d, ruleId, { ...condition, check: check.id })
      ),
    [check.id, condition, edit, ruleId]
  );
  const selected = condition.check === check.id;
  return (
    <Button
      aria-pressed={selected}
      className={pickedClass(selected)}
      onClick={pick}
      size="lg"
      title={check.target || undefined}
    >
      {checkName(draft, check.id)}
    </Button>
  );
}

function CheckPicker({ condition, ruleId }: PickProps) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const shared = draft.rules.some((rule) =>
    rule.when.some(
      (entry) =>
        entry.type === "attested" &&
        entry.check === condition.check &&
        entry.id !== condition.id
    )
  );
  const addNew = useCallback(
    () =>
      edit((d) => {
        const next = addCheck(d);
        const created = next.checks.at(-1);
        return created && next !== d
          ? updateCondition(next, ruleId, { ...condition, check: created.id })
          : d;
      }),
    [condition, edit, ruleId]
  );
  if (draft.checks.length < 2 && !shared) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {draft.checks.map((check) => (
        <CheckOption
          check={check}
          condition={condition}
          key={check.id}
          ruleId={ruleId}
        />
      ))}
      {canAddCheck(draft) ? (
        <Button aria-label="New check" onClick={addNew} size="lg" square>
          <Plus aria-hidden="true" size={15} />
        </Button>
      ) : null}
    </div>
  );
}

function VoterRow({
  check,
  position,
  reviewer,
}: {
  check: DraftCheck;
  position: number;
  reviewer: Reviewer;
}) {
  const { edit, wallet } = useBuilder();
  const patch = useCallback(
    (change: Partial<Reviewer>) =>
      edit((d) =>
        updateCheck(d, check.id, (current) => ({
          ...current,
          reviewers: current.reviewers.map((entry) =>
            entry.id === reviewer.id ? { ...entry, ...change } : entry
          ),
        }))
      ),
    [check.id, edit, reviewer.id]
  );
  const rename = useCallback((label: string) => patch({ label }), [patch]);
  const setAddress = useCallback(
    (address: string) => patch({ address }),
    [patch]
  );
  const useMine = useCallback(
    () => patch({ address: wallet ?? "" }),
    [patch, wallet]
  );
  const remove = useCallback(
    () =>
      edit((d) =>
        updateCheck(d, check.id, (current) =>
          removeReviewer(current, reviewer.id)
        )
      ),
    [check.id, edit, reviewer.id]
  );
  const typed = reviewer.address.trim();
  const invalid = typed !== "" && !isAddress(typed);
  const name = reviewer.label.trim() || `Voter ${position + 1}`;
  return (
    <li className="flex items-center gap-1.5">
      <Input
        className="w-24 shrink-0 sm:w-28"
        inputComponentProps={{ "aria-label": `Name of voter ${position + 1}` }}
        maxLength={LABEL_MAX}
        onChange={rename}
        placeholder="Name"
        size="lg"
        value={reviewer.label}
      />
      <Input
        className="min-w-0 flex-1"
        inputClassName="font-mono text-xs"
        inputComponentProps={{ "aria-label": `Wallet address of ${name}` }}
        onChange={setAddress}
        placeholder="Solana address"
        size="lg"
        valid={!invalid}
        value={reviewer.address}
      />
      {wallet && typed !== wallet ? (
        <Button
          aria-label={`${name} is me`}
          onClick={useMine}
          size="lg"
          square
          title="This is me"
          variant="transparent"
        >
          <UserRound aria-hidden="true" size={15} />
        </Button>
      ) : null}
      <Button
        aria-label={`Remove ${name}`}
        disabled={check.reviewers.length <= 1}
        onClick={remove}
        size="lg"
        square
        variant="transparent"
      >
        <X aria-hidden="true" size={15} />
      </Button>
    </li>
  );
}

function BindToggle({ check, party }: { check: DraftCheck; party: PartySlot }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const bound = check.binds === party.id;
  const toggle = useCallback(
    () =>
      edit((d) =>
        updateCheck(d, check.id, (current) => ({
          ...current,
          binds: bound ? null : party.id,
        }))
      ),
    [bound, check.id, edit, party.id]
  );
  return (
    <Button
      aria-pressed={bound}
      className={pickedClass(bound)}
      onClick={toggle}
      size="lg"
      title={
        check.kind === "github_pr_merged"
          ? 'The nodes take the wallet from the line "pact: <address>" in the pull request'
          : "Each yes vote carries a wallet. Enough votes for the same one fill the place"
      }
    >
      A yes vote names {partyName(draft, party.id)}
    </Button>
  );
}

function CheckForm({ check }: { check: DraftCheck }) {
  const { edit } = useBuilder();
  const draft = useDraft();
  const openParties = draft.parties.filter((party) => party.open);
  const setTarget = useCallback(
    (target: string) =>
      edit((d) => updateCheck(d, check.id, (c) => ({ ...c, target }))),
    [check.id, edit]
  );
  const setExpect = useCallback(
    (expect: string) =>
      edit((d) => updateCheck(d, check.id, (c) => ({ ...c, expect }))),
    [check.id, edit]
  );
  const setThreshold = useCallback(
    (threshold: number) =>
      edit((d) => updateCheck(d, check.id, (c) => ({ ...c, threshold }))),
    [check.id, edit]
  );
  const add = useCallback(
    () => edit((d) => updateCheck(d, check.id, addReviewer)),
    [check.id, edit]
  );
  const fill = useCallback(
    () => edit((d) => updateCheck(d, check.id, withDemoNodes)),
    [check.id, edit]
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        {KIND_ORDER.map((kind) => (
          <KindOption check={check} key={kind} kind={kind} />
        ))}
      </div>
      <Input
        autoFocus={check.target === ""}
        inputComponentProps={{ "aria-label": TARGET_LABEL[check.kind] }}
        maxLength={TARGET_MAX}
        onChange={setTarget}
        placeholder={TARGET_HINT[check.kind]}
        size="xl"
        value={check.target}
      />
      {check.kind === "http_contains" ? (
        <Input
          inputComponentProps={{ "aria-label": "Text the page must contain" }}
          maxLength={EXPECT_MAX}
          onChange={setExpect}
          placeholder="Text the page must contain"
          size="xl"
          value={check.expect}
        />
      ) : null}
      <Field label={check.kind === "manual" ? "Voters" : "Witness nodes"}>
        <ul className="flex flex-col gap-1.5">
          {check.reviewers.map((reviewer, position) => (
            <VoterRow
              check={check}
              key={reviewer.id}
              position={position}
              reviewer={reviewer}
            />
          ))}
        </ul>
      </Field>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <NumberField
            aria-label="Yes votes needed"
            className="w-24"
            max={Math.max(1, check.reviewers.length)}
            min={1}
            onChange={setThreshold}
            size="lg"
            value={check.threshold}
          />
          <span className="text-cladd-fg-soft">
            of {check.reviewers.length}
          </span>
        </span>
        {canAddReviewer(check) ? (
          <Button
            aria-label="Add a voter"
            className="ml-auto"
            onClick={add}
            size="lg"
            square
          >
            <Plus aria-hidden="true" size={15} />
          </Button>
        ) : null}
      </div>
      {check.kind !== "manual" && !hasDemoNodes(check) ? (
        <Button
          className="justify-center"
          onClick={fill}
          size="lg"
          title="Three nodes we run on devnet. Anyone can run their own."
        >
          Use the Pact demo witness nodes
        </Button>
      ) : null}
      {openParties.map((party) => (
        <BindToggle check={check} key={party.id} party={party} />
      ))}
      <ProblemLines anchor={anchors.check(check.id)} />
    </>
  );
}

export function CheckEditor({ condition, ruleId }: PickProps) {
  const draft = useDraft();
  const check = draft.checks.find((entry) => entry.id === condition.check);
  return (
    <>
      <CheckPicker condition={condition} ruleId={ruleId} />
      {check ? <CheckForm check={check} /> : null}
    </>
  );
}
