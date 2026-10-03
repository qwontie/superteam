import { nowSeconds } from "@pact/sdk";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { type TemplateKey, templateDraft } from "@/features/builder/model";
import { Start } from "@/features/builder/start";
import { BuilderProvider, useBuilder } from "@/features/builder/state";
import { Workspace } from "@/features/builder/workspace";

const TEMPLATE_KEYS: readonly string[] = ["gig", "bounty", "silence"];

const useTemplateParam = () => {
  const { replace } = useBuilder();
  const navigate = useNavigate();
  const { template } = useSearch({ strict: false }) as { template?: unknown };
  useEffect(() => {
    if (typeof template !== "string") {
      return;
    }
    if (TEMPLATE_KEYS.includes(template)) {
      replace(templateDraft(template as TemplateKey, nowSeconds()));
    }
    navigate({ replace: true, to: "/new" }).catch(() => undefined);
  }, [navigate, replace, template]);
};

function BuilderScreen() {
  const { draft } = useBuilder();
  const origin = useRef<HTMLElement>(null);
  useTemplateParam();
  if (!draft) {
    return <Start prompt={null} />;
  }
  return <Workspace origin={origin} prompt={null} streaming={false} />;
}

export function BuilderEntry() {
  return (
    <BuilderProvider>
      <BuilderScreen />
    </BuilderProvider>
  );
}
