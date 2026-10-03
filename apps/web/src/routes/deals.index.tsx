import { createFileRoute } from "@tanstack/react-router";
import { DealListEntry } from "@/features/deal/entry";

export const Route = createFileRoute("/deals/")({ component: DealListEntry });
