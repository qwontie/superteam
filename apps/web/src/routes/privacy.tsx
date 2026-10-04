import { createFileRoute } from "@tanstack/react-router";
import { Privacy } from "@/features/privacy/privacy";

export const Route = createFileRoute("/privacy")({ component: Privacy });
