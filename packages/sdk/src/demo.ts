export interface WitnessSet {
  label: string;
  threshold: number;
  witnesses: readonly string[];
}

export const DEMO_WITNESS_NODES: WitnessSet = {
  label: "Pact demo witness nodes",
  threshold: 2,
  witnesses: [
    "3LsndN1YHY4stDPH3Mzm3SMG86tEe2ifseCohiiB7XgY",
    "8MuJTQ8H6vbpB7aYZCMHFba4XMq9dxnVuyVgi9CMyJCk",
    "wNrW7RVE5KtChXRNNpBHEHMe9Nd1eEKuaVB2zvYrD95",
  ],
};
