import { describe, expect, test } from "bun:test";
import { type DealSpec, dealSpecJsonSchema, validateDealSpec } from "../src";
import { CLIENT, DEADLINE, demoSpec, NOW, WITNESSES } from "./fixtures";

const problemsOf = (spec: unknown) => {
  const result = validateDealSpec(spec, NOW);
  return result.ok ? [] : result.problems;
};

const edit = (change: (spec: DealSpec) => void) => {
  const spec = demoSpec();
  change(spec);
  return problemsOf(spec);
};

describe("validateDealSpec", () => {
  test("accepts the demo template", () => {
    const result = validateDealSpec(demoSpec(), NOW);
    expect(result.ok).toBe(true);
  });

  test("rejects a deal without an exit rule", () => {
    const problems = edit((spec) => {
      spec.rules = spec.rules.slice(0, 2);
    });
    expect(problems).toEqual([
      'rules: the deal needs an exit rule made only of "after" conditions, so the money can never get stuck',
    ]);
  });

  test("an after condition mixed with others is not an exit rule", () => {
    const problems = edit((spec) => {
      spec.rules = [
        {
          pay: [{ bps: 10_000, party: 0 }],
          when: [
            { ts: DEADLINE, type: "after" },
            { party: 0, type: "signed" },
          ],
        },
      ];
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("exit rule");
  });

  test("rejects an exit rule in the past", () => {
    const problems = edit((spec) => {
      spec.rules[2] = {
        pay: [{ bps: 10_000, party: 0 }],
        when: [{ ts: NOW, type: "after" }],
      };
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("not in the future");
  });

  test("rejects shares that do not add up to 10000", () => {
    const problems = edit((spec) => {
      spec.rules[0] = {
        pay: [{ bps: 9000, party: 1 }],
        when: [{ check: 0, type: "attested" }],
      };
    });
    expect(problems).toEqual([
      "rules[0].pay: shares add up to 9000 bps, they must add up to 10000 (100%)",
    ]);
  });

  test("reports one problem per broken invariant", () => {
    const problems = edit((spec) => {
      spec.funder = 2;
      spec.rules[0] = {
        pay: [{ bps: 10_000, party: 5 }],
        when: [
          { check: 1, type: "attested" },
          { party: 3, type: "signed" },
        ],
      };
      spec.checks[0] = {
        ...spec.checks[0],
        threshold: 4,
      } as DealSpec["checks"][number];
    });
    expect(problems).toEqual([
      "funder: party 2 does not exist, the deal has 2 parties",
      "checks[0].threshold: must be between 1 and 3 (the number of witnesses), got 4",
      "rules[0].when[0]: check 1 does not exist, the deal has 1 checks",
      "rules[0].when[1]: party 3 does not exist, the deal has 2 parties",
      "rules[0].pay[0]: party 5 does not exist, the deal has 2 parties",
    ]);
  });

  test("rejects threshold zero", () => {
    const problems = edit((spec) => {
      (spec.checks[0] as DealSpec["checks"][number]).threshold = 0;
    });
    expect(problems).toEqual([
      "checks[0].threshold: must be between 1 and 3 (the number of witnesses), got 0",
    ]);
  });

  test("rejects duplicate witnesses and duplicate parties", () => {
    const problems = edit((spec) => {
      spec.parties = [CLIENT, CLIENT];
      (spec.checks[0] as DealSpec["checks"][number]).witnesses = [
        WITNESSES[0] as string,
        WITNESSES[0] as string,
      ];
      (spec.checks[0] as DealSpec["checks"][number]).threshold = 1;
    });
    expect(problems).toEqual([
      `parties: ${CLIENT} appears more than once`,
      `checks[0].witnesses: ${WITNESSES[0]} appears more than once`,
    ]);
  });

  test("enforces the shape limits", () => {
    const spec = demoSpec();
    const problems = problemsOf({
      ...spec,
      amount: "0",
      checks: [...spec.checks, ...spec.checks, ...spec.checks],
      parties: [CLIENT],
      rules: Array.from({ length: 7 }, () => spec.rules[2]),
      title: "x".repeat(49),
    });
    expect(problems.map((problem) => problem.split(":")[0])).toEqual([
      "amount",
      "checks",
      "parties",
      "rules",
      "title",
    ]);
  });

  test("counts the title limit in UTF-8 bytes", () => {
    expect(
      edit((spec) => {
        spec.title = "ż".repeat(24);
      })
    ).toEqual([]);
    expect(
      edit((spec) => {
        spec.title = "ż".repeat(25);
      })[0]
    ).toStartWith("title:");
  });

  test("rejects an unknown check kind and a bad address", () => {
    const problems = edit((spec) => {
      (spec.checks[0] as { kind: string }).kind = "oracle";
      spec.parties[1] = "not-an-address";
    });
    expect(problems.map((problem) => problem.split(":")[0])).toEqual([
      "checks[0].kind",
      "parties[1]",
    ]);
  });

  test("exports a JSON schema for the AI service", () => {
    const schema = dealSpecJsonSchema() as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).toEqual([
      "amount",
      "checks",
      "funder",
      "parties",
      "rules",
      "title",
    ]);
  });
});
