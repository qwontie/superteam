import { createFileRoute } from "@tanstack/react-router";
import { BuilderEntry } from "@/features/builder/entry";

export const Route = createFileRoute("/new")({ component: BuilderEntry });
