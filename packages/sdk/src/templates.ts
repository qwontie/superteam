import type { CheckKind, DealSpec } from "./spec";

const CLIENT = 0;
const FREELANCER = 1;
const ALL = 10_000;

const lamportsText = (amount: bigint | string) => amount.toString();

export const majority = (witnesses: number) => Math.floor(witnesses / 2) + 1;

export interface FreelanceWithCheckInput {
  amount: bigint | string;
  check: {
    kind?: CheckKind;
    target: string;
    expect?: string;
    witnesses: string[];
    threshold?: number;
  };
  client: string;
  deadline: number;
  freelancer: string;
  title: string;
}

export const freelanceWithCheck = (
  input: FreelanceWithCheckInput
): DealSpec => ({
  amount: lamportsText(input.amount),
  checks: [
    {
      expect: input.check.expect ?? "",
      kind: input.check.kind ?? "manual",
      target: input.check.target,
      threshold:
        input.check.threshold ?? majority(input.check.witnesses.length),
      witnesses: input.check.witnesses,
    },
  ],
  funder: CLIENT,
  parties: [input.client, input.freelancer],
  rules: [
    {
      pay: [{ bps: ALL, party: FREELANCER }],
      when: [{ check: 0, type: "attested" }],
    },
    {
      pay: [{ bps: ALL, party: FREELANCER }],
      when: [{ party: CLIENT, type: "signed" }],
    },
    {
      pay: [{ bps: ALL, party: CLIENT }],
      when: [{ ts: input.deadline, type: "after" }],
    },
  ],
  title: input.title,
});

export interface SilenceIsConsentInput {
  amount: bigint | string;
  client: string;
  deliveryDeadline: number;
  finalExit: number;
  freelancer: string;
  reviewEnd: number;
  title: string;
}

export const silenceIsConsent = (input: SilenceIsConsentInput): DealSpec => ({
  amount: lamportsText(input.amount),
  checks: [],
  funder: CLIENT,
  parties: [input.client, input.freelancer],
  rules: [
    {
      pay: [{ bps: ALL, party: FREELANCER }],
      when: [{ party: CLIENT, type: "signed" }],
    },
    {
      pay: [{ bps: ALL, party: FREELANCER }],
      when: [
        { party: FREELANCER, type: "signed" },
        { ts: input.reviewEnd, type: "after" },
      ],
    },
    {
      pay: [{ bps: ALL, party: CLIENT }],
      when: [
        { party: FREELANCER, type: "unsigned" },
        { ts: input.deliveryDeadline, type: "after" },
      ],
    },
    {
      pay: [{ bps: ALL, party: CLIENT }],
      when: [{ ts: input.finalExit, type: "after" }],
    },
  ],
  title: input.title,
});
