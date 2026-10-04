import { nowSeconds } from "@pact/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { LayoutGroup } from "motion/react";
import { type ReactNode, useCallback, useEffect } from "react";
import { AiProvider, useAi } from "@/features/builder/ai";
import { Created } from "@/features/builder/created";
import { PromptBar } from "@/features/builder/prompt-bar";
import { Start } from "@/features/builder/start";
import { isStarterKey, starterDraft } from "@/features/builder/starters";
import { BuilderProvider, useBuilder } from "@/features/builder/state";
import { Workspace } from "@/features/builder/workspace";
import { usePlan } from "@/lib/use-plan";
import { type Quota, quotaKey } from "@/lib/use-quota";
import { useWalletProof } from "@/lib/wallet-proof";

const useTemplateParam = () => {
  const { replace } = useBuilder();
  const navigate = useNavigate();
  const { template } = useSearch({ strict: false }) as { template?: unknown };
  useEffect(() => {
    if (typeof template !== "string") {
      return;
    }
    if (isStarterKey(template)) {
      replace(starterDraft(template, nowSeconds()));
    }
    navigate({ replace: true, search: {}, to: "/new" }).catch(() => undefined);
  }, [navigate, replace, template]);
};

function AiBridge({ children }: { children: ReactNode }) {
  const { wallet } = useBuilder();
  const plan = usePlan();
  const { proof, request } = useWalletProof();
  const queryClient = useQueryClient();
  const pro = plan.kind === "pro";
  const getProof = useCallback(() => {
    if (proof || !pro) {
      return Promise.resolve(proof);
    }
    return request();
  }, [pro, proof, request]);
  const onQuota = useCallback(
    (quota: Quota) => {
      if (wallet) {
        queryClient.setQueryData(quotaKey(wallet), quota);
      }
    },
    [queryClient, wallet]
  );
  return (
    <AiProvider getProof={getProof} onQuota={onQuota}>
      {children}
    </AiProvider>
  );
}

function BuilderScreen() {
  const { created, draft, locked } = useBuilder();
  const { origin } = useAi();
  useTemplateParam();
  if (created) {
    return <Created created={created} />;
  }
  if (!draft) {
    return <Start prompt={<PromptBar variant="hero" />} />;
  }
  return (
    <Workspace
      origin={origin}
      prompt={<PromptBar variant="dock" />}
      streaming={locked}
    />
  );
}

export function BuilderEntry() {
  return (
    <BuilderProvider>
      <AiBridge>
        <LayoutGroup>
          <BuilderScreen />
        </LayoutGroup>
      </AiBridge>
    </BuilderProvider>
  );
}
