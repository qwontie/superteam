import {
  bounty,
  type DealSpec,
  gig,
  silenceIsConsent,
  solToLamports,
} from "@pact/sdk";

export interface Starter {
  key: "gig" | "bounty" | "silence";
  labels: readonly string[];
  name: string;
  spec: DealSpec;
}

const HOUR = 3600;
const DAY = 86_400;
const GIG_DAYS = 7;
const REVIEW_DAYS = 3;
const FINAL_DAYS = 14;
const REVIEWERS = ["Reviewer 1", "Reviewer 2", "Reviewer 3"];
const PAIR = ["Client", "Freelancer"] as const;

export const KNOWN_PLACES = { Q270: "Warsaw" };

export const starters = (now: number): Starter[] => {
  const start = Math.ceil(now / HOUR) * HOUR;
  return [
    {
      key: "gig",
      labels: PAIR,
      name: "Gig",
      spec: gig({
        amount: solToLamports("2"),
        check: {
          target: "The work is delivered as agreed",
          witnesses: REVIEWERS,
        },
        client: PAIR[0],
        deadline: start + GIG_DAYS * DAY,
        freelancer: PAIR[1],
        title: "Gig",
      }),
    },
    {
      key: "bounty",
      labels: ["Sponsor", "Winner"],
      name: "Bounty",
      spec: bounty({
        amount: solToLamports("5"),
        check: {
          target: "This submission wins the bounty",
          witnesses: REVIEWERS,
        },
        deadline: start + GIG_DAYS * DAY,
        sponsor: "Sponsor",
        title: "Bounty",
      }),
    },
    {
      key: "silence",
      labels: PAIR,
      name: "Silence is consent",
      spec: silenceIsConsent({
        amount: solToLamports("1"),
        client: PAIR[0],
        deliveryDeadline: start + GIG_DAYS * DAY,
        finalExit: start + FINAL_DAYS * DAY,
        freelancer: PAIR[1],
        reviewEnd: start + REVIEW_DAYS * DAY,
        title: "Silence is consent",
      }),
    },
  ];
};
