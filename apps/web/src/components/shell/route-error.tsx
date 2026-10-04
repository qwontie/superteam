import { Button, cn } from "@cladd-ui/react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { PAGE } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/shell/button-link";

const SHELL = cn(PAGE, "flex flex-col gap-4 py-16 sm:py-24");

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <main className={SHELL}>
      <h1 className="font-display font-semibold text-3xl tracking-tight">
        This screen broke
      </h1>
      <p className="max-w-xl text-cladd-fg-soft">
        Your deals and money are safe on chain. Try again.
      </p>
      <pre className="max-w-2xl overflow-x-auto rounded-block bg-cladd-surface-cut p-4 font-mono text-cladd-fg-soft text-xs shadow-cladd-cut-outline">
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
    <main className={SHELL}>
      <h1 className="font-display font-semibold text-3xl tracking-tight">
        Nothing at this address
      </h1>
      <p className="max-w-xl text-cladd-fg-soft">This page does not exist.</p>
      <div>
        <ButtonLink size="xl" to="/" variant="solid-fill">
          Back to home
        </ButtonLink>
      </div>
    </main>
  );
}
