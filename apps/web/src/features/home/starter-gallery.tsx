import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { DealRule } from "@/components/pact/deal-rule";
import {
  STARTER_FACT_LABELS,
  STARTERS,
  type Starter,
  type StarterKey,
} from "@/features/builder/starters";
import { useFactLabels } from "@/features/deal/queries";

const ORDER: readonly StarterKey[] = [
  "gig",
  "price",
  "bounty",
  "silence",
  "merged",
  "fact",
];

const ORDERED = ORDER.flatMap((key) =>
  STARTERS.filter((starter) => starter.key === key)
);

function StarterCard({ starter }: { starter: Starter }) {
  const factLabels = useFactLabels(starter.spec, STARTER_FACT_LABELS);
  return (
    <Link
      aria-label={starter.label}
      className="group mb-4 flex break-inside-avoid flex-col gap-4 rounded-[22px] bg-cladd-surface-cut p-4 shadow-cladd-cut-outline transition-colors duration-200 ease-pact hover:bg-[color-mix(in_oklab,var(--color-cladd-surface-white)_3%,var(--color-cladd-surface-cut))]"
      search={{ template: starter.key }}
      to="/new"
    >
      <span className="flex items-center justify-between gap-3 px-1 font-display font-semibold text-xl tracking-[-0.01em]">
        {starter.name}
        <ArrowRight
          aria-hidden="true"
          className="text-cladd-fg-softer transition-[translate,color] duration-200 ease-pact group-hover:translate-x-1 group-hover:text-cladd-fg"
          size={18}
        />
      </span>
      <span className="flex flex-col gap-2.5">
        {starter.spec.rules.map((rule, index) => (
          <DealRule
            factLabels={factLabels}
            key={JSON.stringify(rule)}
            labels={starter.labels}
            ruleIndex={index}
            showAddresses={false}
            spec={starter.spec}
          />
        ))}
      </span>
    </Link>
  );
}

export function StarterGallery() {
  return (
    <section aria-labelledby="home-starters">
      <h2 className="sr-only" id="home-starters">
        Start from a deal
      </h2>
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {ORDERED.map((starter) => (
          <StarterCard key={starter.key} starter={starter} />
        ))}
      </div>
    </section>
  );
}
