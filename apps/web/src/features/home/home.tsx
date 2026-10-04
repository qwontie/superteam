import { cn } from "@cladd-ui/react";
import { PAGE } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/shell/button-link";
import { useSettledDeals } from "@/features/home/chain";
import { ExampleDeal } from "@/features/home/example-deal";
import { SettledDeals } from "@/features/home/settled-deals";
import { StarterGallery } from "@/features/home/starter-gallery";
import { Verifiers } from "@/features/home/verifiers";
import { Vocabulary } from "@/features/home/vocabulary";

export function Home() {
  const { recent, verified } = useSettledDeals();
  return (
    <main className={cn(PAGE, "flex flex-col gap-20 pt-10 sm:pt-16")}>
      <div className="flex flex-col gap-8">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,11fr)_minmax(0,14fr)] lg:gap-14">
          <div className="flex flex-col gap-6 lg:pt-28">
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
            <div className="pt-1">
              <ButtonLink
                className="px-3 font-semibold text-base"
                size="2xl"
                to="/new"
                variant="solid-fill"
              >
                New deal
              </ButtonLink>
            </div>
          </div>
          <ExampleDeal />
        </div>
        <Vocabulary />
      </div>
      <StarterGallery />
      <SettledDeals deals={recent} />
      <Verifiers verified={verified} />
    </main>
  );
}
