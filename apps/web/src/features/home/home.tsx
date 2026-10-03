import { cn } from "@cladd-ui/react";
import { PAGE } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/shell/button-link";
import { ExampleDeal } from "@/features/home/example-deal";
import { RealDealLink } from "@/features/home/real-deal";

export function Home() {
  return (
    <main
      className={cn(
        PAGE,
        "grid items-center gap-10 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,11fr)_minmax(0,14fr)] lg:gap-14"
      )}
    >
      <div className="flex flex-col gap-6">
        <h1 className="font-display font-semibold text-[2.5rem] leading-none tracking-[-0.02em] sm:text-6xl lg:text-[3.5rem] xl:text-[3.75rem]">
          Lock the payment.
          <br />
          Let the rules
          <br />
          release it.
        </h1>
        <p className="text-cladd-fg-soft text-lg">
          For gigs and bounties. No platform holds the money.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
          <ButtonLink
            className="px-3 font-semibold text-base"
            size="2xl"
            to="/new"
            variant="solid-fill"
          >
            New deal
          </ButtonLink>
          <RealDealLink />
        </div>
      </div>
      <ExampleDeal />
    </main>
  );
}
