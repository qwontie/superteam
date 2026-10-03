import { USER_AGENT } from "./guarded-fetch";

export interface GithubResponse {
  json: unknown;
  status: number;
}

export type GithubGet = (path: string) => Promise<GithubResponse>;

const API = "https://api.github.com";
const TIMEOUT_MS = 10_000;

export class GithubRateLimited extends Error {
  readonly until: number;

  constructor(until: number) {
    super(`GitHub rate limit, paused until ${new Date(until).toISOString()}`);
    this.until = until;
  }
}

const pauseUntil = (response: Response, now: number) => {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (retryAfter > 0) {
    return now + retryAfter * 1000;
  }
  if (response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    return reset > 0 ? reset * 1000 : now + 60_000;
  }
  return null;
};

export const createGithub = (input: {
  fetchImpl?: typeof fetch;
  now?: () => number;
  token?: string;
}): GithubGet => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  const cache = new Map<string, { etag: string; json: unknown }>();
  let pausedUntil = 0;
  return async (path) => {
    if (now() < pausedUntil) {
      throw new GithubRateLimited(pausedUntil);
    }
    const cached = cache.get(path);
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": USER_AGENT,
      "x-github-api-version": "2022-11-28",
    };
    if (input.token) {
      headers.authorization = `Bearer ${input.token}`;
    }
    if (cached) {
      headers["if-none-match"] = cached.etag;
    }
    const response = await fetchImpl(`${API}${path}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 304 && cached) {
      return { json: cached.json, status: 200 };
    }
    if (response.status === 403 || response.status === 429) {
      const until = pauseUntil(response, now());
      if (until) {
        pausedUntil = until;
        throw new GithubRateLimited(until);
      }
    }
    const json = await response.json().catch(() => null);
    const etag = response.headers.get("etag");
    if (response.status === 200 && etag) {
      cache.set(path, { etag, json });
    }
    return { json, status: response.status };
  };
};
