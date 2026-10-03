import { cn } from "@cladd-ui/react";
import type { Check, CheckVotes, DealState, Vote } from "@pact/sdk";
import { ArrowUpRight, Check as CheckIcon, Minus, X } from "lucide-react";
import { Party, PartyAvatar } from "@/components/pact/party";
import { checkFact, witnessLabel } from "@/lib/checks";
import { formatWhen, shortAddress } from "@/lib/format";
import { signatureMatters } from "@/lib/pact";

interface PeopleProps {
  deal: DealState;
  labels: readonly string[];
  viewer: string | null;
}

interface CheckCardProps {
  check: Check;
  index: number;
  viewer: string | null;
  votes: CheckVotes | undefined;
}

const VOTE_TEXT: Record<"yes" | "no" | "none", string> = {
  no: "Voted no",
  none: "No vote yet",
  yes: "Voted yes",
};

const voteKey = (vote: Vote) => vote ?? "none";

function VoteMark({ vote }: { vote: Vote }) {
  const key = voteKey(vote);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium text-xs",
        key === "yes" && "text-pact-proof",
        key === "no" && "text-pact-stop",
        key === "none" && "text-cladd-fg-softer"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-4 place-items-center rounded-[5px]",
          key === "yes" && "bg-pact-proof text-pact-ink",
          key === "no" && "bg-pact-stop text-pact-ink",
          key === "none" && "shadow-[inset_0_0_0_1.5px_currentColor]"
        )}
      >
        {key === "yes" ? <CheckIcon size={11} strokeWidth={3} /> : null}
        {key === "no" ? <X size={11} strokeWidth={3} /> : null}
        {key === "none" ? <Minus size={9} strokeWidth={3} /> : null}
      </span>
      {VOTE_TEXT[key]}
    </span>
  );
}

const partyNote = (deal: DealState, index: number) => {
  if (deal.spec.parties[index] === null) {
    return "open slot: the witnesses name who gets it";
  }
  const signedAt = deal.signals[index] ?? null;
  const parts: string[] = [];
  if (index === deal.spec.funder) {
    parts.push(deal.status === "draft" ? "funds the deal" : "funded the deal");
  }
  if (signedAt !== null) {
    parts.push(`signed ${formatWhen(signedAt)}`);
  } else if (deal.status === "funded" && signatureMatters(deal, index)) {
    parts.push("has not signed");
  }
  return parts.join(", ");
};

function CheckCard({ check, index, votes, viewer }: CheckCardProps) {
  const yes = votes?.yes ?? 0;
  const no = votes?.no ?? 0;
  const fact = checkFact(check);
  const who = fact.automated ? "nodes" : "witnesses";
  return (
    <li className="flex flex-col gap-3 rounded-block bg-cladd-surface p-4 shadow-cladd-outline">
      <div className="flex flex-col gap-1.5">
        <span className="break-words font-medium">{fact.statement}</span>
        {fact.linkText ? (
          <CheckSource href={fact.href} text={fact.linkText} />
        ) : null}
        <span className="text-cladd-fg-soft text-sm">
          {fact.method}. {check.threshold} of {check.witnesses.length} {who}{" "}
          {typeof check.binds === "number"
            ? "must name the same winner"
            : "must say yes"}
          : {yes} yes, {no} no so far.
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {check.witnesses.map((witness, position) => (
          <li className="flex items-center justify-between gap-3" key={witness}>
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <PartyAvatar seed={witness} size={20} />
              <span className="truncate">{witnessLabel(check, position)}</span>
              <span className="font-mono text-cladd-fg-soft text-xs">
                {shortAddress(witness)}
              </span>
              {viewer === witness ? (
                <span className="rounded-full bg-cladd-fg px-1.5 py-px font-semibold text-[0.65rem] text-cladd-bg uppercase">
                  You
                </span>
              ) : null}
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <VoteMark vote={votes?.byWitness[position] ?? null} />
              {votes?.nominees[position] ? (
                <span className="font-mono text-cladd-fg-soft text-xs">
                  for {shortAddress(votes.nominees[position] ?? "")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <span className="sr-only">Check {index + 1}</span>
    </li>
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
      className="inline-flex items-start gap-1 self-start break-all font-mono text-pact-proof text-xs underline decoration-pact-proof/40 hover:decoration-current"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {text}
      <ArrowUpRight aria-hidden="true" className="mt-0.5 shrink-0" size={12} />
    </a>
  );
}

export function DealPeople({ deal, labels, viewer }: PeopleProps) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="font-display font-semibold text-xl tracking-tight">
          People
        </h2>
        <ul className="flex flex-col gap-2.5">
          {deal.spec.parties.map((party, index) => (
            <li
              className="flex flex-col items-start gap-1"
              key={party ?? `open-${index}`}
            >
              <Party
                address={party}
                label={labels[index] ?? `Party ${index + 1}`}
                you={viewer === party}
              />
              <span className="pl-1 text-cladd-fg-soft text-xs">
                {partyNote(deal, index)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {deal.spec.checks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-display font-semibold text-xl tracking-tight">
            Checks
          </h2>
          <ul className="flex flex-col gap-3">
            {deal.spec.checks.map((check, index) => (
              <CheckCard
                check={check}
                index={index}
                key={check.target}
                viewer={viewer}
                votes={deal.votes[index]}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
