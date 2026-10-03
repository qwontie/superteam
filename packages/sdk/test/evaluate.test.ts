import { describe, expect, test } from "bun:test";
import {
  evaluateDeal,
  evaluateRule,
  silenceIsConsent,
  votesFromBitmaps,
} from "../src";
import {
  CLIENT,
  DEADLINE,
  demoSpec,
  FREELANCER,
  NOW,
  stateOf,
} from "./fixtures";

describe("evaluateRule", () => {
  test("nothing fires on a fresh funded deal", () => {
    const deal = stateOf(demoSpec());
    expect(evaluateDeal(deal, NOW).executable).toEqual([]);
    const exit = evaluateRule(deal, 2, NOW);
    expect(exit.canExecute).toBe(false);
    expect(exit.conditions[0]?.reason).toBe(
      "opens at 2026-09-22T14:13:20Z, in 24h 0m"
    );
  });

  test("attested fires at the threshold", () => {
    const one = stateOf(demoSpec(), {
      votes: [votesFromBitmaps(0b001, 0b010, 3)],
    });
    expect(evaluateRule(one, 0, NOW).blockedBy).toBe(
      "1 of 3 witnesses said yes, 2 needed"
    );
    const two = stateOf(demoSpec(), {
      votes: [votesFromBitmaps(0b101, 0b010, 3)],
    });
    expect(evaluateRule(two, 0, NOW).canExecute).toBe(true);
    expect(two.votes[0]?.byWitness).toEqual(["yes", "no", "yes"]);
  });

  test("signed and the exit rule", () => {
    const deal = stateOf(demoSpec(), { signals: [NOW - 10, null] });
    expect(evaluateDeal(deal, NOW).executable).toEqual([1]);
    expect(evaluateDeal(deal, DEADLINE).executable).toEqual([1, 2]);
  });

  test("silence is consent walks through its windows", () => {
    const spec = silenceIsConsent({
      amount: 5_000_000n,
      client: CLIENT,
      deliveryDeadline: NOW + 100,
      finalExit: NOW + 300,
      freelancer: FREELANCER,
      reviewEnd: NOW + 200,
      title: "Logo",
    });
    const silent = stateOf(spec);
    expect(evaluateDeal(silent, NOW + 100).executable).toEqual([2]);
    const delivered = stateOf(spec, { signals: [null, NOW + 50] });
    expect(evaluateDeal(delivered, NOW + 150).executable).toEqual([]);
    expect(evaluateRule(delivered, 2, NOW + 150).blockedBy).toContain(
      "party 1 already signed"
    );
    expect(evaluateDeal(delivered, NOW + 200).executable).toEqual([1]);
    expect(evaluateDeal(delivered, NOW + 300).executable).toEqual([1, 3]);
  });

  test("a deal that is not funded cannot execute", () => {
    const draft = stateOf(demoSpec(), { status: "draft" });
    expect(evaluateRule(draft, 2, DEADLINE).blockedBy).toBe(
      "the deal is draft, only a funded deal can be executed"
    );
    const settled = stateOf(demoSpec(), { settledRule: 2, status: "settled" });
    expect(evaluateRule(settled, 2, DEADLINE).blockedBy).toBe(
      "the deal is already settled by rule 2"
    );
    expect(evaluateRule(settled, 9, DEADLINE).blockedBy).toBe(
      "rule 9 does not exist"
    );
  });
});
