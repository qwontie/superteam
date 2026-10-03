import { createHash } from "node:crypto";
import { type LookupAddress, lookup } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { isPrivateAddress } from "./address-guard";

export interface FetchPolicy {
  allowHttp: boolean;
  allowPrivate: boolean;
  maxBytes: number;
  maxRedirects: number;
  timeoutMs: number;
}

export const DEFAULT_POLICY: FetchPolicy = {
  allowHttp: false,
  allowPrivate: false,
  maxBytes: 1_048_576,
  maxRedirects: 3,
  timeoutMs: 10_000,
};

export interface FetchedPage {
  body: Uint8Array;
  sha256: string;
  status: number;
  truncated: boolean;
  url: string;
}

export type PageFetcher = (url: string) => Promise<FetchedPage>;

export const USER_AGENT = "pact-witness/0.1";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

const hostOf = (url: URL) => url.hostname.replace(/^\[|\]$/g, "");

export const urlProblem = (url: URL, policy: FetchPolicy) => {
  if (
    url.protocol !== "https:" &&
    !(policy.allowHttp && url.protocol === "http:")
  ) {
    return `scheme ${url.protocol} is not allowed, only https`;
  }
  if (url.username || url.password) {
    return "credentials in the URL are not allowed";
  }
  const host = hostOf(url);
  if (isIP(host) && !policy.allowPrivate && isPrivateAddress(host)) {
    return `${host} is a private or reserved address`;
  }
  return null;
};

const guardedLookup =
  (policy: FetchPolicy): LookupFunction =>
  (hostname, options, callback) => {
    lookup(hostname, { all: true }, (error, addresses: LookupAddress[]) => {
      if (error) {
        callback(error, "", 0);
        return;
      }
      const blocked = policy.allowPrivate
        ? undefined
        : addresses.find((entry) => isPrivateAddress(entry.address));
      const [first] = addresses;
      if (blocked || !first) {
        callback(
          new Error(
            blocked
              ? `${hostname} resolves to a private address ${blocked.address}`
              : `${hostname} has no address`
          ),
          "",
          0
        );
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      callback(null, first.address, first.family);
    });
  };

const decoded = (response: IncomingMessage) => {
  const encoding = String(response.headers["content-encoding"] ?? "")
    .trim()
    .toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") {
    return response.pipe(createGunzip());
  }
  if (encoding === "deflate") {
    return response.pipe(createInflate());
  }
  if (encoding === "br") {
    return response.pipe(createBrotliDecompress());
  }
  return response;
};

interface Hop {
  body: Uint8Array;
  location: string | null;
  status: number;
  truncated: boolean;
}

const requestOnce = (url: URL, policy: FetchPolicy) =>
  new Promise<Hop>((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(
      url,
      {
        headers: {
          accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.8",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": USER_AGENT,
        },
        lookup: guardedLookup(policy),
        method: "GET",
        timeout: policy.timeoutMs,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location ?? null;
        if (REDIRECTS.has(status)) {
          response.resume();
          resolve({
            body: new Uint8Array(),
            location,
            status,
            truncated: false,
          });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const stream = decoded(response);
        const finish = () => {
          clearTimeout(deadline);
          resolve({
            body: new Uint8Array(
              Buffer.concat(chunks).subarray(0, policy.maxBytes)
            ),
            location: null,
            status,
            truncated,
          });
        };
        stream.on("data", (chunk: Buffer) => {
          if (truncated) {
            return;
          }
          chunks.push(chunk);
          size += chunk.length;
          if (size >= policy.maxBytes) {
            truncated = size > policy.maxBytes;
            response.destroy();
            finish();
          }
        });
        stream.on("end", finish);
        stream.on("error", (error) => {
          clearTimeout(deadline);
          reject(error);
        });
      }
    );
    const deadline = setTimeout(
      () => request.destroy(new Error(`timeout after ${policy.timeoutMs} ms`)),
      policy.timeoutMs
    );
    request.on("timeout", () =>
      request.destroy(new Error(`timeout after ${policy.timeoutMs} ms`))
    );
    request.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    request.end();
  });

export const createPageFetcher =
  (policy: FetchPolicy = DEFAULT_POLICY): PageFetcher =>
  async (target) => {
    let url = new URL(target);
    for (let hop = 0; hop <= policy.maxRedirects; hop += 1) {
      const problem = urlProblem(url, policy);
      if (problem) {
        throw new Error(problem);
      }
      // biome-ignore lint/performance/noAwaitInLoops: each redirect hop depends on the previous answer
      const result = await requestOnce(url, policy);
      if (!result.location) {
        return {
          body: result.body,
          sha256: createHash("sha256").update(result.body).digest("hex"),
          status: result.status,
          truncated: result.truncated,
          url: url.toString(),
        };
      }
      url = new URL(result.location, url);
    }
    throw new Error(`more than ${policy.maxRedirects} redirects`);
  };
