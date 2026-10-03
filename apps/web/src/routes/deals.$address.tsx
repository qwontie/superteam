import { createFileRoute } from "@tanstack/react-router";
import { DealPageEntry } from "@/features/deal/entry";

function DealPage() {
  const { address } = Route.useParams();
  return <DealPageEntry address={address} />;
}

export const Route = createFileRoute("/deals/$address")({
  component: DealPage,
});
