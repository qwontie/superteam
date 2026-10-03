import { cn, Tooltip } from "@cladd-ui/react";
import type { Check, CheckVotes, Vote } from "@pact/sdk";
import { ArrowUpRight, Check as CheckIcon, Minus, X } from "lucide-react";
import type { ReactNode } from "react";
import { PartyAvatar } from "@/components/pact/party";
import { checkFact, witnessLabel } from "@/lib/checks";
import { shortAddress } from "@/lib/format";

interface DealCheckProps {
  action?: ReactNode;
  check: Check;
  viewer: string | null;
  votes: CheckVotes | undefined;
}

const VOTE_TEXT: Record<"yes" | "no" | "none", string> = {
  no: "voted no",
  none: "no vote yet",
  yes: "voted yes",
};

function VoteMark({ vote }: { vote: Vote }) {
  const key = vote ?? "none";
  return (
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[5px]",
        key === "yes" && "bg-pact-proof text-pact-ink",
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

export function DealCheck({ check, votes, viewer, action }: DealCheckProps) {
  const fact = checkFact(check);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Tooltip tooltip={fact.method}>
          <span className="break-words text-sm">{fact.statement}</span>
        </Tooltip>
        {fact.linkText ? (
          <CheckSource href={fact.href} text={fact.linkText} />
        ) : null}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {check.witnesses.map((witness, position) => {
          const nominee = votes?.nominees[position] ?? null;
          return (
            <li
              className="flex items-center gap-1.5 text-cladd-fg-soft text-xs"
              key={witness}
            >
              <VoteMark vote={votes?.byWitness[position] ?? null} />
              <PartyAvatar seed={witness} size={16} />
              <span className="text-cladd-fg">
                {witnessLabel(check, position)}
              </span>
              <span className="font-mono" title={witness}>
                {shortAddress(witness)}
              </span>
              {nominee ? (
                <span className="font-mono" title={nominee}>
                  for {shortAddress(nominee)}
                </span>
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
