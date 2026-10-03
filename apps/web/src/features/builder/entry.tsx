import { cn } from "@cladd-ui/react";
import { PAGE } from "@/components/shell/app-shell";

export function BuilderEntry() {
  return (
    <main className={cn(PAGE, "flex flex-col gap-4 pt-10 sm:pt-16")}>
      <h1 className="font-display font-semibold text-4xl tracking-tight">
        New deal
      </h1>
      <p className="max-w-xl text-cladd-fg-soft">
        The deal builder is not here yet.
      </p>
    </main>
  );
}
