import { Button } from "@cladd-ui/react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { ButtonLink } from "@/components/shell/button-link";

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-5 py-24">
      <h1 className="font-display font-semibold text-3xl tracking-tight">
        This screen broke
      </h1>
      <p className="text-cladd-fg-soft">
        Your deals and your money are not affected: they live on chain, not in
        this page. Try again, and if it keeps happening send us the line below.
      </p>
      <pre className="overflow-x-auto rounded-block bg-cladd-surface-cut p-4 font-mono text-cladd-fg-soft text-xs shadow-cladd-cut-outline">
        {error instanceof Error ? error.message : String(error)}
      </pre>
      <div className="flex gap-2">
        <Button onClick={reset} size="xl" variant="solid-fill">
          Try again
        </Button>
        <ButtonLink size="xl" to="/">
          Back to home
        </ButtonLink>
      </div>
    </main>
  );
}

export function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-5 py-24">
      <h1 className="font-display font-semibold text-3xl tracking-tight">
        Nothing at this address
      </h1>
      <p className="text-cladd-fg-soft">
        The page you opened does not exist. Deals live under /deals.
      </p>
      <div>
        <ButtonLink size="xl" to="/" variant="solid-fill">
          Back to home
        </ButtonLink>
      </div>
    </main>
  );
}
