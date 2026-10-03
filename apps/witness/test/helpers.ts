import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GithubGet } from "../src/github";
import type { FetchedPage } from "../src/guarded-fetch";

const FIXTURES = join(import.meta.dir, "fixtures");

export const fixtureText = (name: string) =>
  readFileSync(join(FIXTURES, name), "utf8");

export const fixtureJson = <T = unknown>(name: string) =>
  JSON.parse(fixtureText(name)) as T;

export const page = (
  body: string,
  overrides: Partial<FetchedPage> = {}
): FetchedPage => ({
  body: new TextEncoder().encode(body),
  sha256: "0".repeat(64),
  status: 200,
  truncated: false,
  url: "https://example.com/",
  ...overrides,
});

export const fakeGithub = (
  routes: Record<string, { json: unknown; status?: number }>
): GithubGet & { calls: string[] } => {
  const calls: string[] = [];
  const get = (path: string) => {
    calls.push(path);
    const route = routes[path];
    if (!route) {
      return Promise.resolve({ json: { message: "Not Found" }, status: 404 });
    }
    return Promise.resolve({ json: route.json, status: route.status ?? 200 });
  };
  return Object.assign(get, { calls });
};
