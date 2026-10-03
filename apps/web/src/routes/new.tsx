import { createFileRoute } from "@tanstack/react-router";
import { BuilderEntry } from "@/features/builder/entry";

const TEMPLATES = ["gig", "bounty", "silence", "ai"] as const;

type Template = (typeof TEMPLATES)[number];

interface NewDealSearch {
  template?: Template;
}

export const Route = createFileRoute("/new")({
  component: BuilderEntry,
  validateSearch: (search: Record<string, unknown>): NewDealSearch => ({
    template: TEMPLATES.find((entry) => entry === search.template),
  }),
});
