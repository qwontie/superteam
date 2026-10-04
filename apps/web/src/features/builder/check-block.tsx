import {
  cn,
  Input,
  Popover,
  PopoverClose,
  PopoverRoot,
  PopoverTrigger,
} from "@cladd-ui/react";
import { fetchWikidataLabel, WIKIDATA_PROPERTIES } from "@pact/sdk/facts";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  blankVoters,
  type CheckBlock,
  checkBlockOf,
} from "@/features/builder/blocks";
import {
  type FactOp,
  type FactShape,
  factShape,
  knownLabel,
  OP_WORD,
  OPS,
  PAIRS,
  rememberLabel,
  searchWikidata,
  type WikidataHit,
  writeFact,
} from "@/features/builder/facts";
import type { DraftCheck } from "@/features/builder/model";
import { anchors } from "@/features/builder/problems";
import {
  PickSlot,
  SOCKET_BUTTON,
  SOCKET_EMPTY,
  StaticSlot,
  TextSlot,
  useEditable,
} from "@/features/builder/slots";
import { Checker, useCheckEdit, VotersButton } from "@/features/builder/voters";

const MAX_VOTERS = 5;
const TARGET_MAX = 128;
const EXPECT_MAX = 64;
const VALUE_MAX = 63;
const SEARCH_DELAY_MS = 250;
const SEARCH_STALE_MS = 300_000;
const MIN_QUERY = 2;

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    label: String(index + 1),
    value: String(index + 1),
  }));

const opOptions = (type: keyof typeof OPS) =>
  OPS[type].map((op) => ({ label: OP_WORD[op], value: op }));

const PROPERTY_OPTIONS = Object.entries(WIKIDATA_PROPERTIES).map(
  ([value, label]) => ({ label, value })
);
const PAIR_OPTIONS = PAIRS.map((pair) => ({
  label: pair.split("-")[0] ?? pair,
  value: pair,
}));
const PRICE_OPS = OPS.price.map((op) => ({ label: op, value: op }));

interface BodyProps {
  check: DraftCheck;
}

function Quorum({ check, word }: BodyProps & { word: string }) {
  const change = useCheckEdit(check.id);
  const setThreshold = useCallback(
    (value: string) => change((c) => ({ ...c, threshold: Number(value) })),
    [change]
  );
  const setTotal = useCallback(
    (value: string) =>
      change((c) => {
        const total = Number(value);
        const fresh = blankVoters(word, total).slice(c.reviewers.length);
        return { ...c, reviewers: [...c.reviewers, ...fresh].slice(0, total) };
      }),
    [change, word]
  );
  return (
    <>
      <PickSlot
        label="Yes votes needed"
        onChange={setThreshold}
        options={range(check.reviewers.length)}
        value={String(check.threshold)}
      />
      <span>of</span>
      <PickSlot
        label="Number of voters"
        onChange={setTotal}
        options={range(MAX_VOTERS)}
        value={String(check.reviewers.length)}
      />
    </>
  );
}

const useField = (id: string, field: "target" | "expect") => {
  const change = useCheckEdit(id);
  return useCallback(
    (value: string) => change((c) => ({ ...c, [field]: value })),
    [change, field]
  );
};

function VoteBody({ check }: BodyProps) {
  const setTarget = useField(check.id, "target");
  return (
    <>
      <Quorum check={check} word="Reviewer" />
      <span>people confirm</span>
      <TextSlot
        anchor={anchors.check(check.id)}
        label="What the people confirm"
        max={TARGET_MAX}
        onChange={setTarget}
        placeholder="statement"
        value={check.target}
      />
      <VotersButton check={check} />
    </>
  );
}

function JudgesBody({ check }: BodyProps) {
  return (
    <>
      <Quorum check={check} word="Judge" />
      <span>judges name the winner</span>
      <VotersButton check={check} />
    </>
  );
}

function MergedBody({ check }: BodyProps) {
  const setTarget = useField(check.id, "target");
  return (
    <>
      <span>pull request</span>
      <TextSlot
        anchor={anchors.check(check.id)}
        label="Pull request"
        max={TARGET_MAX}
        mono
        onChange={setTarget}
        placeholder="owner/repo#12"
        value={check.target}
      />
      <span>is merged</span>
      <Checker check={check} />
    </>
  );
}

function GreenBody({ check }: BodyProps) {
  const setTarget = useField(check.id, "target");
  return (
    <>
      <span>checks are green on</span>
      <TextSlot
        anchor={anchors.check(check.id)}
        label="Repository and ref"
        max={TARGET_MAX}
        mono
        onChange={setTarget}
        placeholder="owner/repo@ref"
        value={check.target}
      />
      <Checker check={check} />
    </>
  );
}

const useFact = (check: DraftCheck) => {
  const change = useCheckEdit(check.id);
  return useCallback(
    (next: FactShape) => change((c) => ({ ...c, ...writeFact(next) })),
    [change]
  );
};

type Shape<T extends FactShape["type"]> = Extract<FactShape, { type: T }>;

interface FactProps<T extends FactShape["type"]> extends BodyProps {
  fact: Shape<T>;
}

function PriceBody({ check, fact }: FactProps<"price">) {
  const set = useFact(check);
  const setPair = useCallback(
    (pair: string) => set({ ...fact, pair }),
    [fact, set]
  );
  const setOp = useCallback(
    (op: string) => set({ ...fact, op: op as FactOp }),
    [fact, set]
  );
  const setValue = useCallback(
    (value: string) => set({ ...fact, value: value.replace(",", ".") }),
    [fact, set]
  );
  return (
    <>
      <PickSlot
        label="Asset"
        onChange={setPair}
        options={PAIR_OPTIONS}
        value={fact.pair}
      />
      <span>price is</span>
      <PickSlot
        label="Above or below"
        onChange={setOp}
        options={PRICE_OPS}
        value={fact.op}
      />
      <TextSlot
        anchor={anchors.check(check.id)}
        label="Price level in USD"
        max={VALUE_MAX}
        mode="decimal"
        onChange={setValue}
        placeholder="200"
        value={fact.value}
      />
      <span>USD</span>
    </>
  );
}

const useEntityLabel = (entity: string) => {
  const [label, setLabel] = useState(() => knownLabel(entity) ?? null);
  useEffect(() => {
    const known = knownLabel(entity);
    setLabel(known ?? null);
    if (entity === "" || known) {
      return;
    }
    let live = true;
    fetchWikidataLabel(entity)
      .then((found) => {
        if (found) {
          rememberLabel(entity, found);
        }
        if (live) {
          setLabel(found);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [entity]);
  return label;
};

const useDelayed = (value: string) => {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDelayed(value), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return delayed;
};

function Hit({
  hit,
  onPick,
}: {
  hit: WikidataHit;
  onPick: (hit: WikidataHit) => void;
}) {
  const pick = useCallback(() => onPick(hit), [hit, onPick]);
  return (
    <li>
      <PopoverClose>
        <button
          className="flex w-full flex-col rounded-chip px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-cladd-surface-hover"
          onClick={pick}
          type="button"
        >
          <span className="font-medium text-sm">{hit.label}</span>
          <span className="truncate text-cladd-fg-soft text-xs">
            {hit.description || hit.id}
          </span>
        </button>
      </PopoverClose>
    </li>
  );
}

function EntitySearch({ onPick }: { onPick: (hit: WikidataHit) => void }) {
  const [text, setText] = useState("");
  const asked = useDelayed(text.trim());
  const ready = asked.length >= MIN_QUERY;
  const search = useQuery({
    enabled: ready,
    queryFn: ({ signal }) => searchWikidata(asked, signal),
    queryKey: ["wikidata-search", asked],
    staleTime: SEARCH_STALE_MS,
  });
  const hits = ready ? (search.data ?? []) : [];
  return (
    <div className="flex flex-col gap-2 p-3">
      <Input
        autoFocus
        inputComponentProps={{ "aria-label": "Search Wikidata" }}
        onChange={setText}
        placeholder="Search Wikidata"
        size="xl"
        value={text}
      />
      {hits.length > 0 ? (
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {hits.map((hit) => (
            <Hit hit={hit} key={hit.id} onPick={onPick} />
          ))}
        </ul>
      ) : null}
      {ready && search.isError ? (
        <p className="px-1 text-pact-stop text-sm" role="alert">
          Wikidata did not answer. Try again.
        </p>
      ) : null}
      {ready && search.isSuccess && hits.length === 0 ? (
        <p className="px-1 text-cladd-fg-soft text-sm">Nothing found</p>
      ) : null}
    </div>
  );
}

function EntitySlot({
  anchor,
  entity,
  onPick,
}: {
  anchor: string;
  entity: string;
  onPick: (entity: string) => void;
}) {
  const editable = useEditable();
  const label = useEntityLabel(entity);
  const empty = entity === "";
  const shown = empty ? "who or what" : (label ?? entity);
  const pick = useCallback(
    (hit: WikidataHit) => {
      rememberLabel(hit.id, hit.label);
      onPick(hit.id);
    },
    [onPick]
  );
  if (!editable) {
    return (
      <StaticSlot
        className={empty ? cn(SOCKET_EMPTY, "opacity-75") : undefined}
      >
        {shown}
      </StaticSlot>
    );
  }
  return (
    <PopoverRoot>
      <PopoverTrigger>
        <button
          aria-label={
            empty ? "Wikidata: who or what" : `Wikidata: ${shown}, ${entity}`
          }
          className={cn(SOCKET_BUTTON, empty && SOCKET_EMPTY)}
          data-anchor={empty ? anchor : undefined}
          data-slot=""
          title={empty ? undefined : entity}
          type="button"
        >
          {shown}
        </button>
      </PopoverTrigger>
      <Popover
        className="w-80 max-w-[calc(100vw-2rem)]"
        offset={8}
        position="bottom-start"
      >
        <EntitySearch onPick={pick} />
      </Popover>
    </PopoverRoot>
  );
}

function Outcome({
  anchor,
  fact,
  set,
}: {
  anchor: string;
  fact: Shape<"json"> | Shape<"wikidata">;
  set: (next: FactShape) => void;
}) {
  const setOp = useCallback(
    (op: string) =>
      set({
        ...fact,
        op: op as FactOp,
        value: op === "exists" ? "" : fact.value,
      }),
    [fact, set]
  );
  const setValue = useCallback(
    (value: string) => set({ ...fact, value }),
    [fact, set]
  );
  const numeric = fact.op === "above" || fact.op === "below";
  const item = fact.type === "wikidata" && fact.op === "equals";
  return (
    <>
      <PickSlot
        label="Comparison"
        onChange={setOp}
        options={opOptions(fact.type)}
        value={fact.op}
      />
      {fact.op === "exists" ? null : (
        <TextSlot
          anchor={anchor}
          label="Value"
          max={VALUE_MAX}
          mode={numeric ? "decimal" : "text"}
          onChange={setValue}
          placeholder={item ? "Q30" : "value"}
          value={fact.value}
        />
      )}
    </>
  );
}

function WikidataBody({ check, fact }: FactProps<"wikidata">) {
  const set = useFact(check);
  const anchor = anchors.check(check.id);
  const setEntity = useCallback(
    (entity: string) => set({ ...fact, entity }),
    [fact, set]
  );
  const setProperty = useCallback(
    (property: string) => set({ ...fact, property }),
    [fact, set]
  );
  return (
    <>
      <span>Wikidata:</span>
      <EntitySlot anchor={anchor} entity={fact.entity} onPick={setEntity} />
      <PickSlot
        label="Property"
        onChange={setProperty}
        options={PROPERTY_OPTIONS}
        value={fact.property}
      />
      <Outcome anchor={anchor} fact={fact} set={set} />
    </>
  );
}

function PageBody({ check, fact }: FactProps<"page">) {
  const anchor = anchors.check(check.id);
  const set = useFact(check);
  const setTarget = useCallback(
    (url: string) => set({ ...fact, url: url.replaceAll("#", "") }),
    [fact, set]
  );
  const setExpect = useField(check.id, "expect");
  return (
    <>
      <TextSlot
        anchor={anchor}
        label="Page address"
        max={TARGET_MAX}
        mode="url"
        onChange={setTarget}
        placeholder="https://page"
        value={fact.url}
      />
      <span>contains</span>
      <TextSlot
        anchor={anchor}
        label="Text the page must contain"
        max={EXPECT_MAX}
        onChange={setExpect}
        placeholder="text"
        value={fact.text}
      />
    </>
  );
}

function ApiBody({ check, fact }: FactProps<"json">) {
  const set = useFact(check);
  const anchor = anchors.check(check.id);
  const setUrl = useCallback(
    (url: string) => set({ ...fact, url: url.replaceAll("#", "") }),
    [fact, set]
  );
  const setPath = useCallback(
    (path: string) => set({ ...fact, path }),
    [fact, set]
  );
  return (
    <>
      <span>API</span>
      <TextSlot
        anchor={anchor}
        label="API address"
        max={TARGET_MAX}
        mode="url"
        onChange={setUrl}
        placeholder="https://api"
        value={fact.url}
      />
      <TextSlot
        anchor={anchor}
        label="Path to the value"
        max={TARGET_MAX}
        mono
        onChange={setPath}
        placeholder="data.status"
        value={fact.path}
      />
      <Outcome anchor={anchor} fact={fact} set={set} />
    </>
  );
}

function FactBody({ check }: BodyProps) {
  const fact = factShape(check.target, check.expect);
  if (fact.type === "price") {
    return <PriceBody check={check} fact={fact} />;
  }
  if (fact.type === "wikidata") {
    return <WikidataBody check={check} fact={fact} />;
  }
  if (fact.type === "json") {
    return <ApiBody check={check} fact={fact} />;
  }
  return <PageBody check={check} fact={fact} />;
}

const FACTS = new Set<CheckBlock>(["price", "wikidata", "page", "api"]);

export function CheckBody({ check }: BodyProps) {
  const kind = checkBlockOf(check);
  if (FACTS.has(kind)) {
    return (
      <>
        <FactBody check={check} />
        <Checker check={check} />
      </>
    );
  }
  if (kind === "judges") {
    return <JudgesBody check={check} />;
  }
  if (kind === "merged") {
    return <MergedBody check={check} />;
  }
  if (kind === "green") {
    return <GreenBody check={check} />;
  }
  return <VoteBody check={check} />;
}
