import { createFileRoute } from "@tanstack/react-router";
import { BuilderEntry } from "@/features/builder/entry";
import { STARTER_KEYS } from "@/features/builder/starters";

const TEMPLATES = [...STARTER_KEYS, "ai"] as const;

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
