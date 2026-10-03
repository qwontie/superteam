import type { DealSpec } from "./spec";

export type DealStatus = "draft" | "funded" | "settled" | "cancelled";

export type Vote = "yes" | "no" | null;

export interface CheckVotes {
  byWitness: Vote[];
  no: number;
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
  witnesses: number
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
    yes: byWitness.filter((vote) => vote === "yes").length,
  };
};
