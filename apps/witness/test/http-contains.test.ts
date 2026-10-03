import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { type Server, serve } from "bun";
import {
  createPageFetcher,
  DEFAULT_POLICY,
  type FetchPolicy,
} from "../src/guarded-fetch";
import { verifyHttpContains } from "../src/kinds/http-contains";
import { fixtureText, page } from "./helpers";

const EXAMPLE = fixtureText("example-com.html.txt");
const recorded = () => Promise.resolve(page(EXAMPLE));

describe("http_contains on a recorded page", () => {
  test("yes when the body contains expect", async () => {
    const verdict = await verifyHttpContains(
      "https://example.com",
      "<title>Example Domain</title>",
      recorded
    );
    expect(verdict.kind).toBe("yes");
    expect(verdict.evidence).toContain("https://example.com/ status 200");
  });

  test("comparison is exact and case sensitive", async () => {
    const verdict = await verifyHttpContains(
      "https://example.com",
      "example domain",
      recorded
    );
    expect(verdict.kind).toBe("wait");
  });

  test("wait on a non 2xx answer even if it contains expect", async () => {
    const verdict = await verifyHttpContains(
      "https://example.com",
      "Example",
      () => Promise.resolve(page(EXAMPLE, { status: 404 }))
    );
    expect(verdict.kind).toBe("wait");
  });

  test("wait when the fetch fails", async () => {
    const verdict = await verifyHttpContains(
      "https://example.com",
      "Example",
      () => Promise.reject(new Error("ECONNRESET"))
    );
    expect(verdict).toEqual({
      evidence: "fetch failed: ECONNRESET",
      kind: "wait",
    });
  });

  test.each([
    ["http://example.com", "Example", "scheme http: is not allowed"],
    ["https://127.0.0.1/", "Example", "private or reserved"],
    ["https://[::1]/", "Example", "private or reserved"],
    ["https://user:pw@example.com/", "Example", "credentials"],
    ["not a url", "Example", "is not a URL"],
    ["https://example.com", "", "expect is empty"],
  ])("no for the malformed check %s / %s", async (target, expectText, why) => {
    let fetched = false;
    const verdict = await verifyHttpContains(target, expectText, () => {
      fetched = true;
      return recorded();
    });
    expect(verdict.kind).toBe("no");
    expect(verdict.evidence).toContain(why);
    expect(fetched).toBe(false);
  });
});

describe("guarded fetch", () => {
  let server: Server<unknown>;
  let base = "";
  const open: FetchPolicy = {
    ...DEFAULT_POLICY,
    allowHttp: true,
    allowPrivate: true,
    maxBytes: 64,
  };

  beforeAll(() => {
    server = serve({
      fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname.startsWith("/hop/")) {
          const left = Number(pathname.slice(5));
          return left === 0
            ? new Response("arrived pact-marker")
            : Response.redirect(`/hop/${left - 1}`, 302);
        }
        if (pathname === "/big") {
          return new Response(`${"a".repeat(100)}pact-marker`);
        }
        if (pathname === "/gzip") {
          return new Response(gzipSync("zipped pact-marker"), {
            headers: { "content-encoding": "gzip" },
          });
        }
        return new Response("not found", { status: 404 });
      },
      hostname: "127.0.0.1",
      port: 0,
    });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  test("follows up to three redirects", async () => {
    const fetchPage = createPageFetcher(open);
    const result = await fetchPage(`${base}/hop/3`);
    expect(result.url).toBe(`${base}/hop/0`);
    expect(new TextDecoder().decode(result.body)).toBe("arrived pact-marker");
  });

  test("refuses a fourth redirect", async () => {
    const fetchPage = createPageFetcher(open);
    await expect(fetchPage(`${base}/hop/4`)).rejects.toThrow(
      "more than 3 redirects"
    );
  });

  test("reads only the first maxBytes", async () => {
    const fetchPage = createPageFetcher(open);
    const result = await fetchPage(`${base}/big`);
    expect(result.body.length).toBe(64);
    expect(result.truncated).toBe(true);
    const verdict = await verifyHttpContains(
      `${base}/big`,
      "pact-marker",
      fetchPage,
      open
    );
    expect(verdict.kind).toBe("wait");
  });

  test("decodes gzip", async () => {
    const verdict = await verifyHttpContains(
      `${base}/gzip`,
      "pact-marker",
      createPageFetcher(open),
      open
    );
    expect(verdict.kind).toBe("yes");
  });

  test("default policy refuses plain http and loopback", async () => {
    const fetchPage = createPageFetcher(DEFAULT_POLICY);
    await expect(fetchPage(`${base}/hop/0`)).rejects.toThrow("scheme http:");
    await expect(
      fetchPage(`https://127.0.0.1:${server.port}/`)
    ).rejects.toThrow("private or reserved");
  });

  test("default policy refuses a host name that resolves to loopback", async () => {
    const fetchPage = createPageFetcher(DEFAULT_POLICY);
    await expect(fetchPage("https://localhost/")).rejects.toThrow(
      "resolves to a private address"
    );
  });
});
