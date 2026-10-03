import { cn } from "@cladd-ui/react";
import { nowSeconds } from "@pact/sdk";
import { ArrowRight } from "lucide-react";
import { Fragment, useCallback, useMemo } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { PAGE } from "@/components/shell/app-shell";
import { conditionText, partyName } from "@/features/builder/describe";
import {
  type Draft,
  type DraftRule,
  type TemplateKey,
  templateDraft,
} from "@/features/builder/model";
import { useBuilder } from "@/features/builder/state";

interface TemplateInfo {
  key: TemplateKey;
  lead: string;
  name: string;
  when: string;
}

const TEMPLATES: TemplateInfo[] = [
  {
    key: "gig",
    lead: "Lock the payment today. It goes to the contributor when the reviewers you name confirm the work, or when you sign off yourself. If the deadline passes first, it comes back to you.",
    name: "Post a gig",
    when: "You know who does the work",
  },
  {
    key: "bounty",
    lead: "Lock the prize before anyone starts. The reviewers name the winning wallet, and the prize goes straight there. If they never agree, the prize returns to you after the deadline.",
    name: "Post a bounty",
    when: "The winner is not known yet",
  },
  {
    key: "silence",
    lead: "No reviewers. The contributor marks the work as delivered, and if you say nothing until the review window closes, they are paid. No delivery by the deadline means a refund.",
    name: "Silence is consent",
    when: "Two people, no third party",
  },
];

function RuleLine({ draft, rule }: { draft: Draft; rule: DraftRule }) {
  const [payout] = rule.pay;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {rule.when.map((condition, position) => {
        const text = conditionText(condition, draft);
        return (
          <Fragment key={condition.id}>
            {position > 0 ? (
              <span className="text-cladd-fg-soft text-sm">and</span>
            ) : null}
            <ConditionChip label={text.label} role={text.role} />
          </Fragment>
        );
      })}
      <ArrowRight
        aria-label="then"
        className="text-cladd-fg-soft"
        size={15}
        strokeWidth={2}
      />
      <span className="text-sm">
        <span className="text-cladd-fg-soft">
          {payout?.party === draft.funder ? "refund " : "pay "}
        </span>
        {payout ? partyName(draft, payout.party) : null}
      </span>
    </span>
  );
}

function TemplateRow({ info }: { info: TemplateInfo }) {
  const { replace } = useBuilder();
  const preview = useMemo(
    () => templateDraft(info.key, nowSeconds()),
    [info.key]
  );
  const pick = useCallback(
    () => replace(templateDraft(info.key, nowSeconds())),
    [info.key, replace]
  );
  return (
    <button
      className={cn(
        "group flex flex-col gap-4 rounded-block bg-cladd-surface p-4 text-left shadow-cladd-outline transition-colors duration-200 sm:p-5",
        "hover:bg-cladd-surface-hover"
      )}
      onClick={pick}
      type="button"
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-display font-semibold text-2xl tracking-[-0.01em]">
          {info.name}
        </span>
        <span className="text-cladd-fg-soft text-sm">{info.when}</span>
      </span>
      <span className="max-w-[62ch] text-cladd-fg-soft">{info.lead}</span>
      <span className="hidden flex-col gap-2 sm:flex">
        {preview.rules.map((rule) => (
          <RuleLine draft={preview} key={rule.id} rule={rule} />
        ))}
      </span>
      <span className="inline-flex items-center gap-1.5 font-medium text-sm">
        Start with these blocks
        <ArrowRight
          aria-hidden="true"
          className="transition-transform duration-200 ease-pact group-hover:translate-x-1"
          size={15}
        />
      </span>
    </button>
  );
}

export function Start({ prompt }: { prompt: React.ReactNode }) {
  return (
    <main className={cn(PAGE, "flex flex-col gap-10 pt-10 sm:pt-16")}>
      <header className="flex flex-col gap-4">
        <h1 className="font-display font-semibold text-4xl tracking-[-0.02em] sm:text-5xl">
          What are you paying for?
        </h1>
        <p className="max-w-[58ch] text-cladd-fg-soft text-lg leading-relaxed">
          Start from a deal that already works, or describe yours. Either way
          you get blocks you can read, change and play through before anything
          is signed.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <div className="flex flex-col gap-3">
          {TEMPLATES.map((info) => (
            <TemplateRow info={info} key={info.key} />
          ))}
        </div>
        {prompt}
      </div>
    </main>
  );
}
