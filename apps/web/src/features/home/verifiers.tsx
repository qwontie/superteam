import { DEMO_WITNESS_NODES, PACT_GATE_PROGRAM_ID } from "@pact/sdk";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { ConditionChip } from "@/components/pact/condition-chip";
import { PartyAvatar } from "@/components/pact/party";
import { ExplorerLink } from "@/components/shell/explorer-link";
import { useFactLabels } from "@/features/deal/queries";
import type {
  VerifiedDeal,
  VerifiedDeals,
  Verifier as VerifierKind,
} from "@/features/home/chain";
import { shortAddress } from "@/lib/format";
import { type ConditionText, describeCondition } from "@/lib/pact";

interface VerifierProps {
  children?: ReactNode;
  fallback: ConditionText;
  found: VerifiedDeal | undefined;
  kind: VerifierKind;
  name: string;
}

const ADDRESS = "font-mono text-cladd-fg-soft text-xs";

const FALLBACK: Record<VerifierKind, ConditionText> = {
  nodes: {
    detail: null,
    label: "2 of 3 nodes see the text on the page",
    role: "proof",
  },
  oracles: {
    detail: null,
    label: "Switchboard oracles see the text on the page",
    role: "proof",
  },
  people: {
    detail: null,
    label: "2 of 3 witnesses say yes",
    mark: "vote",
    role: "people",
  },
};

function Addresses({ list }: { list: readonly string[] }) {
  return list.map((entry) => (
    <span className="inline-flex items-center gap-1.5" key={entry}>
      <PartyAvatar seed={entry} size={18} />
      <ExplorerLink className={ADDRESS} path={`/address/${entry}`}>
        {shortAddress(entry)}
      </ExplorerLink>
    </span>
  ));
}

function FoundChip({
  found,
  kind,
}: {
  found: VerifiedDeal;
  kind: VerifierKind;
}) {
  const { check, deal } = found;
  const factLabels = useFactLabels(deal.spec);
  const oracles = useMemo(
    () => (kind === "oracles" ? new Set([check]) : undefined),
    [check, kind]
  );
  const text = describeCondition({ check, type: "attested" }, deal.spec, {
    factLabels,
    oracles,
  });
  return (
    <ConditionChip
      className="self-start"
      label={text.label}
      mark={text.mark}
      role={text.role}
    />
  );
}

function Verifier({ name, kind, fallback, found, children }: VerifierProps) {
  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-block bg-cladd-surface p-4 shadow-cladd-outline">
      <h3 className="font-display font-semibold text-xl tracking-[-0.01em]">
        {name}
      </h3>
      {found ? (
        <FoundChip found={found} kind={kind} />
      ) : (
        <ConditionChip
          className="self-start"
          label={fallback.label}
          mark={fallback.mark}
          role={fallback.role}
        />
      )}
      {children ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {children}
        </div>
      ) : null}
      {found ? (
        <Link
          className="group mt-auto inline-flex min-w-0 max-w-full items-center gap-1.5 self-start rounded-chip pt-1 font-medium text-sm underline decoration-cladd-fg-softest underline-offset-4 hover:decoration-current"
          params={{ address: found.deal.address }}
          to="/deals/$address"
        >
          <span className="truncate">{found.deal.spec.title}</span>
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
          fallback={FALLBACK.people}
          found={verified.people}
          kind="people"
          name="People you name"
        />
        <Verifier
          fallback={FALLBACK.nodes}
          found={verified.nodes}
          kind="nodes"
          name="Pact nodes"
        >
          <Addresses list={DEMO_WITNESS_NODES.witnesses} />
        </Verifier>
        <Verifier
          fallback={FALLBACK.oracles}
          found={verified.oracles}
          kind="oracles"
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
