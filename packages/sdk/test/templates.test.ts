import { describe, expect, test } from "bun:test";
import {
  bounty,
  gig,
  lamportsToSol,
  silenceIsConsent,
  solToLamports,
  validateDealSpec,
} from "../src";
import { CLIENT, DEADLINE, FREELANCER, NOW, WITNESSES } from "./fixtures";

describe("templates", () => {
  test("gig follows the kickoff", () => {
    const spec = gig({
      amount: "10000000",
      check: {
        expect: "pact-1",
        kind: "http_contains",
        target: "https://example.com",
        witnesses: WITNESSES,
      },
      client: CLIENT,
      deadline: DEADLINE,
      freelancer: FREELANCER,
      title: "Landing page",
    });
    expect(spec.funder).toBe(0);
    expect(spec.checks[0]?.threshold).toBe(2);
    expect(
      spec.rules.map((rule) => rule.when.map((condition) => condition.type))
    ).toEqual([["attested"], ["signed"], ["after"]]);
    expect(spec.rules.map((rule) => rule.pay[0]?.party)).toEqual([1, 1, 0]);
    expect(validateDealSpec(spec, NOW).ok).toBe(true);
  });

  test("silenceIsConsent follows the kickoff", () => {
    const spec = silenceIsConsent({
      amount: 5_000_000n,
      client: CLIENT,
      deliveryDeadline: NOW + 100,
      finalExit: NOW + 300,
      freelancer: FREELANCER,
      reviewEnd: NOW + 200,
      title: "Logo",
    });
    expect(spec.checks).toEqual([]);
    expect(spec.rules.map((rule) => rule.when)).toEqual([
      [{ party: 0, type: "signed" }],
      [
        { party: 1, type: "signed" },
        { ts: NOW + 200, type: "after" },
      ],
      [
        { party: 1, type: "unsigned" },
        { ts: NOW + 100, type: "after" },
      ],
      [{ ts: NOW + 300, type: "after" }],
    ]);
    expect(spec.rules.map((rule) => rule.pay[0]?.party)).toEqual([1, 1, 0, 0]);
    expect(validateDealSpec(spec, NOW).ok).toBe(true);
  });

  test("converts SOL and lamports", () => {
    expect(solToLamports("0.01")).toBe(10_000_000n);
    expect(solToLamports("2")).toBe(2_000_000_000n);
    expect(lamportsToSol(10_000_000n)).toBe("0.01");
    expect(lamportsToSol("2000000000")).toBe("2");
    expect(() => solToLamports("0.0000000001")).toThrow();
  });
});

describe("bounty template", () => {
  test("leaves the winner open and fills it through check 0", () => {
    const spec = bounty({
      amount: "20000000",
      check: { target: "Best landing page wins", witnesses: WITNESSES },
      deadline: DEADLINE,
      sponsor: CLIENT,
      title: "Landing page bounty",
    });
    expect(spec.parties).toEqual([CLIENT, null]);
    expect(spec.checks[0]?.binds).toBe(1);
    expect(spec.rules).toEqual([
      {
        pay: [{ bps: 10_000, party: 1 }],
        when: [{ check: 0, type: "attested" }],
      },
      {
        pay: [{ bps: 10_000, party: 0 }],
        when: [{ ts: DEADLINE, type: "after" }],
      },
    ]);
    expect(validateDealSpec(spec, NOW).ok).toBe(true);
  });
});
