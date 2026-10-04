import { nowSeconds } from "@pact/sdk";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { DealRule } from "@/components/pact/deal-rule";
import { type Starter, starters } from "@/features/home/starters";

function StarterCard({ starter }: { starter: Starter }) {
  return (
    <Link
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
  const list = useMemo(() => starters(nowSeconds()), []);
  return (
    <section aria-labelledby="home-starters">
      <h2 className="sr-only" id="home-starters">
        Start from a deal
      </h2>
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {list.map((starter) => (
          <StarterCard key={starter.key} starter={starter} />
        ))}
      </div>
    </section>
  );
}
