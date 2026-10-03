import type { DealSpec, DealState } from "../src";
import { freelanceWithCheck, votesFromBitmaps } from "../src";

export const CLIENT = "8aBswR9arwLWu7YnG94Qswv7yfNfL6vahzrNqi898QbX";
export const FREELANCER = "3iKMsEWGThBcMqviN4FCsqj3um9TacshQXXZCnjcG8YM";
export const WITNESSES = [
  "3LsndN1YHY4stDPH3Mzm3SMG86tEe2ifseCohiiB7XgY",
  "8MuJTQ8H6vbpB7aYZCMHFba4XMq9dxnVuyVgi9CMyJCk",
  "wNrW7RVE5KtChXRNNpBHEHMe9Nd1eEKuaVB2zvYrD95",
];
export const NOW = 1_790_000_000;
export const DEADLINE = NOW + 86_400;

export const demoSpec = (): DealSpec =>
  freelanceWithCheck({
    amount: 10_000_000n,
    check: { target: "Landing page delivered as agreed", witnesses: WITNESSES },
    client: CLIENT,
    deadline: DEADLINE,
    freelancer: FREELANCER,
    title: "Landing page",
  });

export const stateOf = (
  spec: DealSpec,
  overrides: Partial<DealState> = {}
): DealState => ({
  address: "11111111111111111111111111111111",
  creator: CLIENT,
  dealId: 1n,
  lamports: BigInt(spec.amount),
  settledRule: null,
  signals: spec.parties.map(() => null),
  spec,
  status: "funded",
  votes: spec.checks.map((check) =>
    votesFromBitmaps(0, 0, check.witnesses.length)
  ),
  ...overrides,
});
