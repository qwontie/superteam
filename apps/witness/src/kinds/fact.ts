import { describeFact, type Fact, parseFact, readFact } from "@pact/sdk/facts";
import {
  DEFAULT_POLICY,
  type FetchPolicy,
  type PageFetcher,
  urlProblem,
} from "../guarded-fetch";
import { no, reason, type Verdict, wait, yes } from "../verdict";

const FACT_PREFIXES = ["price:", "wikidata:"];

export const isFactTarget = (target: string) =>
  FACT_PREFIXES.some((prefix) => target.startsWith(prefix)) ||
  target.includes("#");

export const verifyFact = async (
  target: string,
  expect: string,
  fetchPage: PageFetcher,
  policy: FetchPolicy = DEFAULT_POLICY
): Promise<Verdict> => {
  let fact: Fact;
  try {
    fact = parseFact(target, expect);
  } catch (error) {
    return no(`not a fact: ${reason(error)}`);
  }
  const sources: string[] = [];
  const fetchText = async (url: string) => {
    const problem = urlProblem(new URL(url), policy);
    if (problem) {
      throw new Error(`source refused: ${problem}`);
    }
    const page = await fetchPage(url);
    sources.push(
      `${page.url} status ${page.status} sha256 ${page.sha256.slice(0, 16)}`
    );
    if (page.status < 200 || page.status > 299) {
      throw new Error(`${page.url} answered ${page.status}`);
    }
    return new TextDecoder("utf-8").decode(page.body);
  };
  const line = describeFact(fact);
  try {
    const { holds, observed } = await readFact(fact, fetchText);
    const evidence = `${line}: read ${observed} from ${sources.join(", ")}`;
    return holds ? yes(evidence) : wait(`not yet, ${evidence}`);
  } catch (error) {
    return wait(`${line}: ${reason(error)}`);
  }
};
