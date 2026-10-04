import { cn } from "@cladd-ui/react";
import { Clock3, Lock, Zap } from "lucide-react";
import { PAGE } from "@/components/shell/app-shell";
import { ButtonLink } from "@/components/shell/button-link";
import { ExampleDeal } from "@/features/home/example-deal";

const FACTS = [
  {
    icon: Lock,
    text: "Rules are final once the deal is created.",
  },
  {
    icon: Clock3,
    text: "Every deal has a time exit, so money never gets stuck.",
  },
  {
    icon: Zap,
    text: "Anyone can fire a rule that is true. No one can fire one that is not.",
  },
] as const;

export function Home() {
  return (
    <main className={cn(PAGE, "flex flex-col gap-20 pt-10 sm:pt-16")}>
      <section className="grid items-start gap-10 lg:grid-cols-[minmax(0,11fr)_minmax(0,14fr)] lg:gap-14">
        <div className="flex flex-col gap-7 lg:pt-6">
          <h1 className="font-display font-semibold text-[2.5rem] leading-none tracking-[-0.02em] sm:text-6xl lg:text-[3.5rem] xl:text-[3.75rem]">
            Lock the payment.
            <br />
            Let the rules
            <br />
            release it.
          </h1>
          <p className="max-w-[34rem] text-cladd-fg-soft text-lg leading-relaxed">
            Pact holds the money for a gig or bounty in an on-chain vault and
            pays out the moment the conditions you agreed on come true: a date,
            a signature, a vote of the people named in the deal, or a fact
            checked by independent oracles. No platform holds it. No one
            approves it.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink
              className="px-3 font-semibold text-base"
              size="2xl"
              to="/new"
              variant="solid-fill"
            >
              New deal
            </ButtonLink>
            <ButtonLink
              className="text-base"
              size="2xl"
              to="/deals"
              variant="transparent"
            >
              Your deals
            </ButtonLink>
          </div>
          <ul className="flex flex-col gap-3 pt-2">
            {FACTS.map(({ icon: Icon, text }) => (
              <li
                className="flex items-start gap-3 text-cladd-fg-soft text-sm"
                key={text}
              >
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-cladd-fg"
                  size={16}
                />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <ExampleDeal />
      </section>
    </main>
  );
}
