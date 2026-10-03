import { cn } from "@cladd-ui/react";
import { nowSeconds } from "@pact/sdk";
import { ArrowRight } from "lucide-react";
import { Fragment, type ReactNode, useCallback, useMemo } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { PAGE } from "@/components/shell/app-shell";
import { useAi } from "@/features/builder/ai";
import { conditionText, partyName } from "@/features/builder/describe";
import {
  type Draft,
  type DraftRule,
  type TemplateKey,
  templateDraft,
} from "@/features/builder/model";
import { useBuilder } from "@/features/builder/state";

const TEMPLATES: { key: TemplateKey; name: string }[] = [
  { key: "gig", name: "Post a gig" },
  { key: "bounty", name: "Post a bounty" },
  { key: "silence", name: "Silence is consent" },
];

const EXAMPLES = [
  {
    name: "Landing page",
    text: "I pay 2 SOL for a landing page. Three reviewers, two must approve. If nothing happens in 10 days, I get the money back.",
  },
  {
    name: "Bug bounty",
    text: "Bounty of 5 SOL for the best bug report. Two of three judges pick the winner. Refund to me after two weeks.",
  },
  {
    name: "Logo design",
    text: "1 SOL to my designer once she marks the logo as done and I stay silent for 3 days. No delivery in a week means a refund.",
  },
] as const;

const MINI = "min-h-6 gap-1.5 py-0.5 pr-2 pl-1 text-xs";

function RuleLine({ draft, rule }: { draft: Draft; rule: DraftRule }) {
  const [payout] = rule.pay;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {rule.when.map((condition, position) => {
        const text = conditionText(condition, draft);
        return (
          <Fragment key={condition.id}>
            {position > 0 ? (
              <span className="text-cladd-fg-soft text-xs">and</span>
            ) : null}
            <ConditionChip
              className={MINI}
              label={text.label}
              role={text.role}
            />
          </Fragment>
        );
      })}
      <ArrowRight
        aria-label="pays"
        className="text-cladd-fg-softer"
        size={13}
        strokeWidth={2}
      />
      <span className="text-cladd-fg-soft text-xs">
        {payout ? partyName(draft, payout.party) : null}
      </span>
    </span>
  );
}

function TemplateCard({
  templateKey,
  name,
}: {
  name: string;
  templateKey: TemplateKey;
}) {
  const { replace } = useBuilder();
  const preview = useMemo(
    () => templateDraft(templateKey, nowSeconds()),
    [templateKey]
  );
  const pick = useCallback(
    () => replace(templateDraft(templateKey, nowSeconds())),
    [replace, templateKey]
  );
  return (
    <button
      className={cn(
        "group flex flex-col justify-between gap-4 rounded-block bg-cladd-surface p-4 text-left shadow-cladd-outline transition-colors duration-200",
        "hover:bg-cladd-surface-hover"
      )}
      onClick={pick}
      type="button"
    >
      <span className="flex flex-col gap-1.5">
        {preview.rules.map((rule) => (
          <RuleLine draft={preview} key={rule.id} rule={rule} />
        ))}
      </span>
      <span className="flex items-center justify-between gap-2 font-display font-semibold text-lg tracking-[-0.01em]">
        {name}
        <ArrowRight
          aria-hidden="true"
          className="text-cladd-fg-softer transition-[translate,color] duration-200 ease-pact group-hover:translate-x-1 group-hover:text-cladd-fg"
          size={16}
        />
      </span>
    </button>
  );
}

function Example({ name, text }: { name: string; text: string }) {
  const { setText } = useAi();
  const pick = useCallback(() => setText(text), [setText, text]);
  return (
    <button
      className="rounded-full px-3 py-1.5 text-cladd-fg-soft text-sm shadow-cladd-outline transition-colors duration-150 hover:bg-cladd-surface-hover hover:text-cladd-fg"
      onClick={pick}
      title={text}
      type="button"
    >
      {name}
    </button>
  );
}

export function Start({ prompt }: { prompt: ReactNode }) {
  return (
    <main
      className={cn(
        PAGE,
        "flex flex-1 flex-col items-center gap-8 pt-10 sm:gap-10 sm:pt-[12vh]"
      )}
    >
      <h1 className="text-balance text-center font-display font-semibold text-4xl tracking-[-0.02em] sm:text-5xl">
        What are you paying for?
      </h1>
      <div className="sticky bottom-0 z-30 order-last mt-auto flex w-full max-w-[44rem] flex-col gap-3 bg-linear-to-t from-70% from-cladd-bg to-transparent pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:order-none sm:mt-0 sm:bg-none sm:p-0">
        {prompt}
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((example) => (
            <Example
              key={example.name}
              name={example.name}
              text={example.text}
            />
          ))}
        </div>
      </div>
      <div className="grid w-full max-w-[66rem] gap-3 md:grid-cols-3">
        {TEMPLATES.map((info) => (
          <TemplateCard
            key={info.key}
            name={info.name}
            templateKey={info.key}
          />
        ))}
      </div>
    </main>
  );
}
