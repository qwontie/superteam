import {
  DEFAULT_POLICY,
  type FetchPolicy,
  type PageFetcher,
  urlProblem,
} from "../guarded-fetch";
import { no, reason, type Verdict, wait, yes } from "../verdict";

const parseTarget = (target: string) => {
  try {
    return new URL(target);
  } catch {
    return null;
  }
};

export const verifyHttpContains = async (
  target: string,
  expect: string,
  fetchPage: PageFetcher,
  policy: FetchPolicy = DEFAULT_POLICY
): Promise<Verdict> => {
  if (expect.length === 0) {
    return no("expect is empty, nothing to look for");
  }
  const url = parseTarget(target);
  if (!url) {
    return no(`target ${JSON.stringify(target)} is not a URL`);
  }
  const problem = urlProblem(url, policy);
  if (problem) {
    return no(`target refused: ${problem}`);
  }
  let page: Awaited<ReturnType<PageFetcher>>;
  try {
    page = await fetchPage(url.toString());
  } catch (error) {
    return wait(`fetch failed: ${reason(error)}`);
  }
  const where = `${page.url} status ${page.status}, ${page.body.length} bytes${page.truncated ? " (first part)" : ""}, sha256 ${page.sha256.slice(0, 16)}`;
  if (page.status < 200 || page.status > 299) {
    return wait(`not a success response: ${where}`);
  }
  const text = new TextDecoder("utf-8").decode(page.body);
  if (!text.includes(expect)) {
    return wait(`${JSON.stringify(expect)} not found in ${where}`);
  }
  return yes(`${JSON.stringify(expect)} found in ${where}`);
};
