export type Verdict =
  | { kind: "yes"; evidence: string; nominee?: string }
  | { kind: "no"; evidence: string }
  | { kind: "wait"; evidence: string };

export const yes = (evidence: string, nominee?: string): Verdict =>
  nominee ? { evidence, kind: "yes", nominee } : { evidence, kind: "yes" };

export const no = (evidence: string): Verdict => ({ evidence, kind: "no" });

export const wait = (evidence: string): Verdict => ({ evidence, kind: "wait" });

export const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
