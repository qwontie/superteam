import {
  DEMO_WITNESS_NODES,
  type DealSpec,
  nowSeconds,
  solToLamports,
} from "@pact/sdk";
import { useMemo } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { Payout } from "@/components/pact/deal-rule";
import { RuleBlock } from "@/components/pact/rule-block";
import { useFactLabels } from "@/features/deal/queries";
import { describeCondition } from "@/lib/pact";

const DAY = 86_400;
const HOUR = 3600;
const DEADLINE_DAYS = 7;
const ALL = 10_000;
const CLIENT = 0;
const FREELANCER = 1;
const LABELS = ["Client", "Freelancer"];
const REVIEWERS = ["Reviewer 1", "Reviewer 2", "Reviewer 3"];
const ORACLE = { threshold: 1, witnesses: ["Switchboard oracles"] };

const vocabulary = (deadline: number): DealSpec => ({
  amount: solToLamports("2.5").toString(),
  checks: [
    {
      binds: null,
      expect: "",
      kind: "manual",
      target: "The work is delivered as agreed",
      threshold: 2,
      witnesses: REVIEWERS,
    },
    {
      binds: null,
      expect: "",
      kind: "github_pr_merged",
      target: "",
      threshold: DEMO_WITNESS_NODES.threshold,
      witnesses: [...DEMO_WITNESS_NODES.witnesses],
    },
    {
      ...ORACLE,
      binds: null,
      expect: ">200",
      kind: "http_contains",
      target: "price:SOL-USD",
    },
    {
      ...ORACLE,
      binds: null,
      expect: ">1500000",
      kind: "http_contains",
      target: "wikidata:Q270/P1082",
    },
  ],
  funder: CLIENT,
  parties: LABELS,
  rules: [
    {
      pay: [{ bps: ALL, party: FREELANCER }],
      when: [
        { ts: deadline, type: "after" },
        { party: CLIENT, type: "signed" },
        { check: 0, type: "attested" },
        { check: 1, type: "attested" },
        { check: 2, type: "attested" },
        { check: 3, type: "attested" },
      ],
    },
    { pay: [{ bps: ALL, party: CLIENT }], when: [] },
  ],
  title: "Blocks",
});

export function Vocabulary() {
  const spec = useMemo(
    () =>
      vocabulary(Math.ceil(nowSeconds() / HOUR) * HOUR + DEADLINE_DAYS * DAY),
    []
  );
  const factLabels = useFactLabels(spec);
  const pieces = (spec.rules[0]?.when ?? []).map((condition) => ({
    key: JSON.stringify(condition),
    text: describeCondition(condition, spec, { factLabels, labels: LABELS }),
  }));
  return (
    <section aria-labelledby="home-blocks">
      <h2 className="sr-only" id="home-blocks">
        Blocks a deal is made of
      </h2>
      <RuleBlock
        label="Blocks"
        then={spec.rules.flatMap((rule) =>
          rule.pay.map((share) => (
            <Payout
              key={share.party}
              labels={LABELS}
              share={share}
              showAddresses={false}
              spec={spec}
            />
          ))
        )}
        when={pieces.map(({ key, text }) => (
          <ConditionChip
            key={key}
            label={text.label}
            mark={text.mark}
            role={text.role}
          />
        ))}
      />
    </section>
  );
}
