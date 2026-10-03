import type { CheckKind, DealSpec } from "./spec";

const CLIENT = 0;
const FREELANCER = 1;
const ALL = 10_000;

const lamportsText = (amount: bigint | string) => amount.toString();

export const majority = (witnesses: number) => Math.floor(witnesses / 2) + 1;

export interface CheckInput {
  expect?: string;
  kind?: CheckKind;
  target: string;
  threshold?: number;
  witnesses: string[];
}

const checkFrom = (input: CheckInput, binds: number | null) => ({
  binds,
  expect: input.expect ?? "",
  kind: input.kind ?? "manual",
  target: input.target,
  threshold: input.threshold ?? majority(input.witnesses.length),
  witnesses: input.witnesses,
});

export interface GigInput {
  amount: bigint | string;
  check: CheckInput;
  client: string;
  deadline: number;
  freelancer: string;
  title: string;
}

export const gig = (input: GigInput): DealSpec => ({
  amount: lamportsText(input.amount),
  checks: [checkFrom(input.check, null)],
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

export interface BountyInput {
  amount: bigint | string;
  check: CheckInput;
  deadline: number;
  sponsor: string;
  title: string;
}

const SPONSOR = 0;
const WINNER = 1;

export const bounty = (input: BountyInput): DealSpec => ({
  amount: lamportsText(input.amount),
  checks: [checkFrom(input.check, WINNER)],
  funder: SPONSOR,
  parties: [input.sponsor, null],
  rules: [
    {
      pay: [{ bps: ALL, party: WINNER }],
      when: [{ check: 0, type: "attested" }],
    },
    {
      pay: [{ bps: ALL, party: SPONSOR }],
      when: [{ ts: input.deadline, type: "after" }],
    },
  ],
  title: input.title,
});
