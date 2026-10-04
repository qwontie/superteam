import {
  DEMO_WITNESS_NODES,
  type DealState,
  PACT_GATE_PROGRAM_ID,
} from "@pact/sdk";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { PartyAvatar } from "@/components/pact/party";
import { ExplorerLink } from "@/components/shell/explorer-link";
import type { VerifiedDeals } from "@/features/home/chain";
import { shortAddress } from "@/lib/format";

interface VerifierProps {
  children: ReactNode;
  chip: string;
  deal: DealState | undefined;
  name: string;
  people?: boolean;
}

const REVIEWERS = ["Reviewer 1", "Reviewer 2", "Reviewer 3"];
const ADDRESS = "font-mono text-cladd-fg-soft text-xs";

function Verifier({
  name,
  chip,
  deal,
  children,
  people = false,
}: VerifierProps) {
  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-block bg-cladd-surface p-4 shadow-cladd-outline">
      <h3 className="font-display font-semibold text-xl tracking-[-0.01em]">
        {name}
      </h3>
      <ConditionChip
        className="self-start"
        label={chip}
        mark={people ? "vote" : null}
        role={people ? "people" : "proof"}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {children}
      </div>
      {deal ? (
        <Link
          className="group mt-auto inline-flex min-w-0 max-w-full items-center gap-1.5 self-start rounded-chip pt-1 font-medium text-sm underline decoration-cladd-fg-softest underline-offset-4 hover:decoration-current"
          params={{ address: deal.address }}
          to="/deals/$address"
        >
          <span className="truncate">{deal.spec.title}</span>
          <ArrowRight
            aria-hidden="true"
            className="shrink-0 transition-[translate] duration-200 ease-pact group-hover:translate-x-1"
            size={15}
          />
        </Link>
      ) : null}
    </li>
  );
}

export function Verifiers({ verified }: { verified: VerifiedDeals }) {
  return (
    <section aria-labelledby="home-verifiers">
      <h2 className="sr-only" id="home-verifiers">
        Who verifies
      </h2>
      <ul className="grid gap-4 md:grid-cols-3">
        <Verifier
          chip="2 of 3 witnesses say yes"
          deal={verified.people}
          name="People you name"
          people
        >
          {REVIEWERS.map((label) => (
            <span
              className="inline-flex items-center gap-1.5 text-cladd-fg-soft text-xs"
              key={label}
            >
              <PartyAvatar seed={label} size={18} />
              {label}
            </span>
          ))}
        </Verifier>
        <Verifier
          chip="2 of 3 nodes see the text on the page"
          deal={verified.nodes}
          name="Pact nodes"
        >
          {DEMO_WITNESS_NODES.witnesses.map((node) => (
            <span className="inline-flex items-center gap-1.5" key={node}>
              <PartyAvatar seed={node} size={18} />
              <ExplorerLink className={ADDRESS} path={`/address/${node}`}>
                {shortAddress(node)}
              </ExplorerLink>
            </span>
          ))}
        </Verifier>
        <Verifier
          chip="Switchboard oracles see the text on the page"
          deal={verified.oracles}
          name="Switchboard, 3 oracles"
        >
          <ExplorerLink
            className={ADDRESS}
            path={`/address/${PACT_GATE_PROGRAM_ID}`}
          >
            {shortAddress(PACT_GATE_PROGRAM_ID, 6)}
          </ExplorerLink>
        </Verifier>
      </ul>
    </section>
  );
}
