import { cn, Tooltip } from "@cladd-ui/react";
import type { Check, CheckVotes, Vote } from "@pact/sdk";
import type { Fact, FactReading } from "@pact/sdk/facts";
import { ArrowUpRight, Check as CheckIcon, Minus, X } from "lucide-react";
import type { ReactNode } from "react";
import { PartyAvatar } from "@/components/pact/party";
import { useFactReading } from "@/features/deal/queries";
import {
  type CheckFact,
  checkFact,
  ORACLE_FACT_METHOD,
  ORACLE_METHOD,
  witnessLabel,
} from "@/lib/checks";
import { shortAddress } from "@/lib/format";

interface DealCheckProps {
  action?: ReactNode;
  check: Check;
  label?: string;
  oracle?: boolean;
  viewer: string | null;
  votes: CheckVotes | undefined;
  waiting?: boolean;
}

const VOTE_TEXT: Record<"yes" | "no" | "none", string> = {
  no: "voted no",
  none: "no vote yet",
  yes: "voted yes",
};

function VoteMark({ vote, people }: { people: boolean; vote: Vote }) {
  const key = vote ?? "none";
  return (
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[5px]",
        key === "yes" && "text-pact-ink",
        key === "yes" && (people ? "bg-pact-people" : "bg-pact-proof"),
        key === "no" && "bg-pact-stop text-pact-ink",
        key === "none" &&
          "text-cladd-fg-softer shadow-[inset_0_0_0_1.5px_currentColor]"
      )}
      title={VOTE_TEXT[key]}
    >
      {key === "yes" ? (
        <CheckIcon aria-hidden="true" size={11} strokeWidth={3} />
      ) : null}
      {key === "no" ? <X aria-hidden="true" size={11} strokeWidth={3} /> : null}
      {key === "none" ? (
        <Minus aria-hidden="true" size={9} strokeWidth={3} />
      ) : null}
      <span className="sr-only">{VOTE_TEXT[key]}</span>
    </span>
  );
}

function CheckSource({ href, text }: { href: string | null; text: string }) {
  if (!href) {
    return (
      <span className="break-all font-mono text-cladd-fg-soft text-xs">
        {text}
      </span>
    );
  }
  return (
    <a
      className="inline-flex items-start gap-1 break-all font-mono text-pact-proof text-xs underline decoration-pact-proof/40 hover:decoration-current"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {text}
      <ArrowUpRight aria-hidden="true" className="mt-0.5 shrink-0" size={12} />
    </a>
  );
}

const PRICE_DIGITS = 2;
const PLUS_SIGN = /^\+/;

const readingText = (fact: Fact, reading: FactReading) => {
  if (fact.source.type === "price") {
    const [, quote] = fact.source.pair.split("-");
    return `${Number(reading.observed).toFixed(PRICE_DIGITS)} ${quote}`;
  }
  if (fact.source.type === "wikidata") {
    return reading.observed.replace(PLUS_SIGN, "");
  }
  return reading.observed;
};

function FactNow({ fact, live }: { fact: Fact; live: boolean }) {
  const reading = useFactReading(fact, live);
  if (!reading.data) {
    return null;
  }
  return (
    <span className="text-sm tabular-nums">
      <span className="text-cladd-fg-soft">now </span>
      {readingText(fact, reading.data)}
    </span>
  );
}

function FactSources({
  fact,
  live,
  method,
}: {
  fact: CheckFact;
  live: boolean;
  method: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {fact.fact ? <FactNow fact={fact.fact} live={live} /> : null}
      <Tooltip tooltip={method}>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {fact.links.map((link) => (
            <CheckSource href={link.href} key={link.href} text={link.text} />
          ))}
        </span>
      </Tooltip>
    </div>
  );
}

export function DealCheck({
  check,
  votes,
  viewer,
  action,
  label,
  oracle = false,
  waiting = false,
}: DealCheckProps) {
  const fact = checkFact(check, label);
  return (
    <div className="flex flex-col gap-2">
      {fact.fact ? (
        <FactSources
          fact={fact}
          live={waiting}
          method={oracle ? ORACLE_FACT_METHOD : fact.method}
        />
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Tooltip tooltip={oracle ? ORACLE_METHOD : fact.method}>
            <span className="break-words text-sm">{fact.statement}</span>
          </Tooltip>
          {fact.linkText ? (
            <CheckSource href={fact.href} text={fact.linkText} />
          ) : null}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {check.witnesses.map((witness, position) => {
          const nominee = votes?.nominees[position] ?? null;
          const vote = votes?.byWitness[position] ?? null;
          return (
            <li
              className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 whitespace-nowrap text-cladd-fg-soft text-xs"
              key={witness}
            >
              <VoteMark people={!fact.automated} vote={vote} />
              {oracle ? null : <PartyAvatar seed={witness} size={16} />}
              <span className="text-cladd-fg">
                {witnessLabel(check, position, oracle)}
              </span>
              <span className="font-mono" title={witness}>
                {shortAddress(witness)}
              </span>
              {nominee ? (
                <span className="font-mono" title={nominee}>
                  for {shortAddress(nominee)}
                </span>
              ) : null}
              {oracle && waiting && vote === null ? (
                <span>Oracles do not see it yet</span>
              ) : null}
              {viewer === witness ? (
                <span className="rounded-full bg-cladd-fg px-1.5 py-px font-semibold text-[0.65rem] text-cladd-bg uppercase">
                  You
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {action}
    </div>
  );
}
