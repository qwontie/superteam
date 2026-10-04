import {
  type Condition,
  DEMO_WITNESS_NODES,
  type DealSpec,
  nowSeconds,
  solToLamports,
} from "@pact/sdk";
import { type ReactNode, useMemo } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { Payout } from "@/components/pact/deal-rule";
import { STARTER_FACT_LABELS } from "@/features/builder/starters";
import { useFactLabels } from "@/features/deal/queries";
import { describeCondition } from "@/lib/pact";

const DAY = 86_400;
const HOUR = 3600;
const DEADLINE_DAYS = 7;
const ALL = 10_000;
const SPLIT = 7000;
const CLIENT = 0;
const FREELANCER = 1;
const LABELS = ["Client", "Freelancer"];
const REVIEWERS = ["Reviewer 1", "Reviewer 2", "Reviewer 3"];
const VOTE = {
  expect: "",
  kind: "manual",
  threshold: 2,
  witnesses: REVIEWERS,
} as const;
const NODES = {
  binds: null,
  expect: "",
  threshold: DEMO_WITNESS_NODES.threshold,
  witnesses: [...DEMO_WITNESS_NODES.witnesses],
};
const ORACLE = {
  binds: null,
  kind: "http_contains",
  threshold: 1,
  witnesses: ["Switchboard oracles"],
} as const;
const PAGE_CHECK = 7;
const ORACLES: ReadonlySet<number> = new Set([PAGE_CHECK]);
const CELL =
  "flex flex-wrap content-start items-start gap-2 bg-cladd-surface-cut p-4";
const PAYOUT =
  "inline-flex min-h-9 items-center rounded-chip bg-[color-mix(in_oklab,var(--color-pact-money)_10%,transparent)] pr-0.5 pl-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-pact-money)_34%,transparent)]";

const SPEC: DealSpec = {
  amount: solToLamports("2.5").toString(),
  checks: [
    {
      ...VOTE,
      binds: null,
      target: "The work is delivered as agreed",
      witnesses: REVIEWERS,
    },
    {
      ...VOTE,
      binds: FREELANCER,
      target: "This submission wins",
      witnesses: REVIEWERS,
    },
    { ...NODES, kind: "github_pr_merged", target: "" },
    { ...NODES, kind: "github_checks", target: "" },
    {
      ...ORACLE,
      expect: ">200",
      target: "price:SOL-USD",
      witnesses: [...ORACLE.witnesses],
    },
    {
      ...ORACLE,
      expect: "<50000",
      target: "price:BTC-USD",
      witnesses: [...ORACLE.witnesses],
    },
    {
      ...ORACLE,
      expect: ">1500000",
      target: "wikidata:Q270/P1082",
      witnesses: [...ORACLE.witnesses],
    },
    {
      ...ORACLE,
      expect: "delivered",
      target: "https://pact.qwontie.dev/proof/delivery.html",
      witnesses: [...ORACLE.witnesses],
    },
  ],
  funder: CLIENT,
  parties: LABELS,
  rules: [],
  title: "Blocks",
};

const attested = (check: number): Condition => ({ check, type: "attested" });

const groups = (deadline: number): { name: string; pieces: Condition[] }[] => [
  { name: "Time", pieces: [{ ts: deadline, type: "after" }] },
  { name: "GitHub", pieces: [attested(2), attested(3)] },
  { name: "Price", pieces: [attested(4), attested(5)] },
  {
    name: "People",
    pieces: [
      { party: CLIENT, type: "signed" },
      { party: FREELANCER, type: "unsigned" },
      attested(0),
      attested(1),
    ],
  },
  { name: "Facts", pieces: [attested(6), attested(PAGE_CHECK)] },
];

function Piece({ children }: { children: ReactNode }) {
  return <li className="flex max-w-full">{children}</li>;
}

export function Vocabulary() {
  const now = useMemo(() => nowSeconds(), []);
  const list = useMemo(
    () => groups(Math.ceil(now / HOUR) * HOUR + DEADLINE_DAYS * DAY),
    [now]
  );
  const factLabels = useFactLabels(SPEC, STARTER_FACT_LABELS);
  return (
    <section aria-labelledby="home-blocks">
      <h2 className="sr-only" id="home-blocks">
        Blocks a deal is made of
      </h2>
      <div className="grid gap-px overflow-hidden rounded-[22px] bg-cladd-bg-outline shadow-cladd-cut-outline md:grid-cols-2 xl:grid-cols-3">
        {list.map((group) => (
          <ul aria-label={group.name} className={CELL} key={group.name}>
            {group.pieces.map((piece) => {
              const text = describeCondition(piece, SPEC, {
                factLabels,
                labels: LABELS,
                now,
                oracles: ORACLES,
              });
              return (
                <Piece key={JSON.stringify(piece)}>
                  <ConditionChip
                    detail={text.detail}
                    label={text.label}
                    mark={text.mark}
                    role={text.role}
                  />
                </Piece>
              );
            })}
          </ul>
        ))}
        <ul aria-label="Payout" className={CELL}>
          <Piece>
            <span className={PAYOUT}>
              <Payout
                labels={LABELS}
                share={{ bps: ALL, party: FREELANCER }}
                showAddresses={false}
                spec={SPEC}
              />
            </span>
          </Piece>
          <Piece>
            <span className={PAYOUT}>
              <Payout
                labels={LABELS}
                share={{ bps: ALL, party: CLIENT }}
                showAddresses={false}
                spec={SPEC}
              />
            </span>
          </Piece>
          <Piece>
            <span className={PAYOUT}>
              <Payout
                labels={LABELS}
                share={{ bps: SPLIT, party: FREELANCER }}
                showAddresses={false}
                spec={SPEC}
              />
            </span>
          </Piece>
        </ul>
      </div>
    </section>
  );
}
