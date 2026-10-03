import { createFileRoute } from "@tanstack/react-router";
import { DealListEntry } from "@/features/deal/entry";

interface DealsSearch {
  wallet?: string;
}

function DealsRoute() {
  const { wallet } = Route.useSearch();
  return <DealListEntry wallet={wallet} />;
}

export const Route = createFileRoute("/deals/")({
  component: DealsRoute,
  validateSearch: (search: Record<string, unknown>): DealsSearch => ({
    wallet: typeof search.wallet === "string" ? search.wallet : undefined,
  }),
});
