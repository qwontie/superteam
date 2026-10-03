import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { useDeals } from "@/features/deal/queries";
import { walletRoles } from "@/lib/pact";

const DEMO_WALLET = "8aBswR9arwLWu7YnG94Qswv7yfNfL6vahzrNqi898QbX";
const LINK =
  "inline-flex items-center gap-1.5 rounded-chip font-medium text-cladd-fg-soft underline decoration-cladd-fg-softest underline-offset-4 transition-colors duration-200 hover:text-cladd-fg hover:decoration-current";

export function RealDealLink() {
  const deals = useDeals();
  const settled = useMemo(() => {
    let newest: { address: string; dealId: bigint } | null = null;
    for (const deal of deals.data ?? []) {
      if (
        deal.status === "settled" &&
        walletRoles(deal, DEMO_WALLET).named &&
        (newest === null || deal.dealId > newest.dealId)
      ) {
        newest = deal;
      }
    }
    return newest?.address ?? null;
  }, [deals.data]);
  const label = (
    <>
      See a real deal
      <ArrowRight aria-hidden="true" size={16} />
    </>
  );
  if (settled) {
    return (
      <Link className={LINK} params={{ address: settled }} to="/deals/$address">
        {label}
      </Link>
    );
  }
  return (
    <Link className={LINK} search={{ wallet: DEMO_WALLET }} to="/deals">
      {label}
    </Link>
  );
}
