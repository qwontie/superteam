import { type DealSpec, OPEN_SLOT } from "./spec";

export type DealStatus = "draft" | "funded" | "settled" | "cancelled";

export type Vote = "yes" | "no" | null;

export interface CheckVotes {
  byWitness: Vote[];
  no: number;
  nominees: (string | null)[];
  yes: number;
}

export interface DealState {
  address: string;
  creator: string;
  dealId: bigint;
  lamports: bigint;
  settledRule: number | null;
  signals: (number | null)[];
  spec: DealSpec;
  status: DealStatus;
  votes: CheckVotes[];
}

const hasBit = (mask: number, position: number) =>
  Math.floor(mask / 2 ** position) % 2 === 1;

export const votesFromBitmaps = (
  yes: number,
  no: number,
  witnesses: number,
  nominees: readonly string[] = []
): CheckVotes => {
  const byWitness: Vote[] = [];
  for (let position = 0; position < witnesses; position += 1) {
    if (hasBit(yes, position)) {
      byWitness.push("yes");
    } else if (hasBit(no, position)) {
      byWitness.push("no");
    } else {
      byWitness.push(null);
    }
  }
  return {
    byWitness,
    no: byWitness.filter((vote) => vote === "no").length,
    nominees: byWitness.map((_, position) => {
      const nominee = nominees[position];
      return nominee && nominee !== OPEN_SLOT ? nominee : null;
    }),
    yes: byWitness.filter((vote) => vote === "yes").length,
  };
};

export const leadingNominee = (votes: CheckVotes) => {
  const tally = new Map<string, number>();
  for (const [position, nominee] of votes.nominees.entries()) {
    if (nominee && votes.byWitness[position] === "yes") {
      tally.set(nominee, (tally.get(nominee) ?? 0) + 1);
    }
  }
  let leader: { nominee: string; votes: number } | null = null;
  for (const [nominee, count] of tally) {
    if (!leader || count > leader.votes) {
      leader = { nominee, votes: count };
    }
  }
  return leader;
};
