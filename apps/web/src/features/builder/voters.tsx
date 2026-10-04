import {
  Button,
  cn,
  Input,
  NumberField,
  Popover,
  PopoverRoot,
  PopoverTrigger,
} from "@cladd-ui/react";
import { isAddress } from "@solana/kit";
import {
  ChevronDown,
  Plus,
  Radio,
  Server,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { type ChangeEvent, useCallback, useState } from "react";
import { blankVoters } from "@/features/builder/blocks";
import { partyName, slotGap } from "@/features/builder/describe";
import { isOracle, withOracle } from "@/features/builder/gate";
import {
  addReviewer,
  canAddReviewer,
  type DraftCheck,
  hasDemoNodes,
  type PartySlot,
  type Reviewer,
  removeReviewer,
  updateCheck,
  withDemoNodes,
} from "@/features/builder/model";
import {
  Field,
  POPOVER_BODY,
  ProblemLines,
  pickedClass,
  useQuietFocus,
} from "@/features/builder/parts";
import { anchors } from "@/features/builder/problems";
import {
  SOCKET_BUTTON,
  SOCKET_EMPTY,
  useBlockAnchor,
  useEditable,
} from "@/features/builder/slots";
import { useBuilder, useDraft } from "@/features/builder/state";

const LABEL_MAX = 40;
const TARGET_MAX = 128;
const MAJORITY = 2;

export const useCheckEdit = (id: string) => {
  const { edit } = useBuilder();
  return useCallback(
    (change: (check: DraftCheck) => DraftCheck) =>
      edit((d) => updateCheck(d, id, change)),
    [edit, id]
  );
};

function VoterRow({
  check,
  focus,
  position,
  reviewer,
}: {
  check: DraftCheck;
  focus: boolean;
  position: number;
  reviewer: Reviewer;
}) {
  const { wallet } = useBuilder();
  const change = useCheckEdit(check.id);
  const patch = useCallback(
    (next: Partial<Reviewer>) =>
      change((current) => ({
        ...current,
        reviewers: current.reviewers.map((entry) =>
          entry.id === reviewer.id ? { ...entry, ...next } : entry
        ),
      })),
    [change, reviewer.id]
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
    () => change((current) => removeReviewer(current, reviewer.id)),
    [change, reviewer.id]
  );
  const holder = useQuietFocus(focus);
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
      <div className="min-w-0 flex-1" ref={holder}>
        <Input
          inputClassName="font-mono text-xs"
          inputComponentProps={{ "aria-label": `Wallet address of ${name}` }}
          onChange={setAddress}
          placeholder="Solana address"
          size="lg"
          valid={!invalid}
          value={reviewer.address}
        />
      </div>
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
  const draft = useDraft();
  const change = useCheckEdit(check.id);
  const bound = check.binds === party.id;
  const toggle = useCallback(
    () => change((current) => ({ ...current, binds: bound ? null : party.id })),
    [bound, change, party.id]
  );
  return (
    <Button
      aria-pressed={bound}
      className={pickedClass(bound)}
      onClick={toggle}
      size="lg"
      title='The nodes take the wallet from the line "pact: <address>" in the pull request'
    >
      The pull request names {partyName(draft, party.id)}
    </Button>
  );
}

function VoterList({ check }: { check: DraftCheck }) {
  const draft = useDraft();
  const change = useCheckEdit(check.id);
  const [firstEmpty] = useState(
    () =>
      check.reviewers.find((reviewer) => reviewer.address.trim() === "")?.id ??
      null
  );
  const setThreshold = useCallback(
    (threshold: number) => change((c) => ({ ...c, threshold })),
    [change]
  );
  const setTarget = useCallback(
    (target: string) => change((c) => ({ ...c, target })),
    [change]
  );
  const add = useCallback(() => change(addReviewer), [change]);
  const judging = check.kind === "manual" && check.binds !== null;
  const openParties =
    check.kind === "github_pr_merged"
      ? draft.parties.filter((party) => party.open)
      : [];
  return (
    <div className={POPOVER_BODY}>
      {judging ? (
        <Field label="What the judges confirm">
          <Input
            inputComponentProps={{ "aria-label": "What the judges confirm" }}
            maxLength={TARGET_MAX}
            onChange={setTarget}
            size="lg"
            value={check.target}
          />
        </Field>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {check.reviewers.map((reviewer, position) => (
          <VoterRow
            check={check}
            focus={reviewer.id === firstEmpty}
            key={reviewer.id}
            position={position}
            reviewer={reviewer}
          />
        ))}
      </ul>
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
      {openParties.map((party) => (
        <BindToggle check={check} key={party.id} party={party} />
      ))}
      <ProblemLines anchor={anchors.check(check.id)} />
    </div>
  );
}

const addressGap = (check: DraftCheck) => {
  const empty = check.reviewers.filter(
    (reviewer) => reviewer.address.trim() === ""
  ).length;
  if (empty === 0) {
    return null;
  }
  return empty === 1 ? "1 address missing" : `${empty} addresses missing`;
};

export function VotersButton({ check }: { check: DraftCheck }) {
  const editable = useEditable();
  const gap = addressGap(check);
  const anchored = gap !== null && !slotGap(check);
  const content = (
    <>
      <UsersRound aria-hidden="true" className="shrink-0" size={13} />
      {gap ? <span className="truncate">{gap}</span> : null}
    </>
  );
  const look = cn(SOCKET_BUTTON, gap && SOCKET_EMPTY);
  const { block, find } = useBlockAnchor();
  if (!editable) {
    return gap ? <span className={look}>{content}</span> : null;
  }
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <button
          aria-label={gap ? `Voter addresses: ${gap}` : "Voter addresses"}
          className={look}
          data-anchor={anchored ? anchors.check(check.id) : undefined}
          data-slot=""
          ref={find}
          type="button"
        >
          {content}
        </button>
      </PopoverTrigger>
      <Popover
        anchorRef={block}
        className="w-[27rem] max-w-[calc(100vw-2rem)]"
        offset={8}
        position="bottom-start"
      >
        <VoterList check={check} />
      </Popover>
    </PopoverRoot>
  );
}

type CheckerKey = "people" | "nodes" | "oracle";

const CHECKERS: Record<CheckerKey, { icon: typeof Radio; label: string }> = {
  nodes: { icon: Server, label: "Pact nodes" },
  oracle: { icon: Radio, label: "Switchboard, 3 oracles" },
  people: { icon: UsersRound, label: "people" },
};

const checkerOf = (check: DraftCheck): CheckerKey => {
  if (isOracle(check)) {
    return "oracle";
  }
  return hasDemoNodes(check) ? "nodes" : "people";
};

const withChecker = (check: DraftCheck, key: CheckerKey): DraftCheck => {
  if (key === "oracle") {
    return withOracle(check);
  }
  if (key === "nodes") {
    return withDemoNodes(check);
  }
  return { ...check, reviewers: blankVoters("Reviewer"), threshold: MAJORITY };
};

const BADGE =
  "h-6 max-w-full rounded-full border [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:text-[13px] [@media(pointer:coarse)]:leading-[30px] border-[color-mix(in_oklab,currentColor_45%,transparent)] bg-transparent pl-6 font-medium text-xs leading-[22px] outline-none focus:border-current focus-visible:outline-none!";

export function Checker({ check }: { check: DraftCheck }) {
  const editable = useEditable();
  const change = useCheckEdit(check.id);
  const current = checkerOf(check);
  const pick = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const key = event.target.value as CheckerKey;
      change((c) => withChecker(c, key));
    },
    [change]
  );
  const keys: CheckerKey[] =
    check.kind === "http_contains" && check.binds === null
      ? ["oracle", "nodes", "people"]
      : ["nodes", "people"];
  const Icon = CHECKERS[current].icon;
  const gate = check.reviewers[0]?.address.trim() ?? "";
  return (
    <>
      <span
        className="relative inline-flex max-w-full items-center"
        title={current === "oracle" && gate !== "" ? `Gate ${gate}` : undefined}
      >
        <Icon
          aria-hidden="true"
          className="pointer-events-none absolute left-1.5"
          size={12}
        />
        {editable ? (
          <>
            <select
              aria-label="Who checks"
              className={cn(
                BADGE,
                "field-sizing-content cursor-pointer appearance-none pr-5"
              )}
              data-slot=""
              onChange={pick}
              value={current}
            >
              {keys.map((key) => (
                <option key={key} value={key}>
                  {CHECKERS[key].label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-1.5 opacity-70"
              size={12}
            />
          </>
        ) : (
          <span className={cn(BADGE, "inline-block truncate pr-2")}>
            {CHECKERS[current].label}
          </span>
        )}
      </span>
      {current === "people" ? <VotersButton check={check} /> : null}
    </>
  );
}
