import type {
  WireCheck,
  WireDraft,
  WireRule,
  WireSlot,
} from "@/features/builder/model";
import type { Quota } from "@/lib/use-quota";
import type { WalletProof } from "@/lib/wallet-proof";

export interface AiRequest {
  draft: WireDraft | null;
  now: number;
  proof: WalletProof | null;
  text: string;
  timezone: string;
  wallet: string | null;
}

export type AiEvent =
  | { index: number; slot: WireSlot; type: "party" }
  | { amount: string | null; funder: number; title: string; type: "meta" }
  | { check: WireCheck; index: number; type: "check" }
  | { index: number; rule: WireRule; type: "rule" }
  | { index: number; text: string; type: "question" }
  | { type: "reset" }
  | { draft: WireDraft; questions: string[]; quota?: Quota; type: "done" }
  | { code: string; message: string; retryAfter?: number; type: "error" };

const STREAM_URL = "/api/ai/deal/stream";
const HEALTH_URL = "/api/health";
const EVENT_LINE = /^event: (.*)$/m;
const DATA_LINE = /^data: (.*)$/m;
const BREAK = "\n\n";
const JSON_HEADERS = { "content-type": "application/json" };
const KNOWN = new Set([
  "party",
  "meta",
  "check",
  "rule",
  "question",
  "reset",
  "done",
  "error",
]);

const parseChunk = (chunk: string): AiEvent | null => {
  const name = EVENT_LINE.exec(chunk)?.[1]?.trim();
  const data = DATA_LINE.exec(chunk)?.[1];
  if (!(name && KNOWN.has(name))) {
    return null;
  }
  try {
    const payload = data ? (JSON.parse(data) as object) : {};
    return { ...payload, type: name } as AiEvent;
  } catch {
    return null;
  }
};

const failureFrom = async (response: Response): Promise<AiEvent> => {
  const retryAfter = Number(response.headers.get("retry-after")) || undefined;
  try {
    const body = (await response.json()) as {
      detail?: { code?: string; message?: string } | unknown[];
    };
    const detail = Array.isArray(body.detail) ? null : body.detail;
    return {
      code: detail?.code ?? `http_${response.status}`,
      message: detail?.message ?? "",
      retryAfter,
      type: "error",
    };
  } catch {
    return {
      code: `http_${response.status}`,
      message: "",
      retryAfter,
      type: "error",
    };
  }
};

const UNREACHABLE: AiEvent = {
  code: "unreachable",
  message: "",
  type: "error",
};

export const streamDeal = async (
  request: AiRequest,
  onEvent: (event: AiEvent) => void,
  signal: AbortSignal
): Promise<void> => {
  let response: Response;
  try {
    response = await fetch(STREAM_URL, {
      body: JSON.stringify(request),
      headers: JSON_HEADERS,
      method: "POST",
      signal,
    });
  } catch {
    if (!signal.aborted) {
      onEvent(UNREACHABLE);
    }
    return;
  }
  if (!(response.ok && response.body)) {
    onEvent(await failureFrom(response));
    return;
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let finished = false;
  const drain = () => {
    let cut = buffer.indexOf(BREAK);
    while (cut >= 0) {
      const event = parseChunk(buffer.slice(0, cut));
      buffer = buffer.slice(cut + BREAK.length);
      if (event) {
        finished ||= event.type === "done" || event.type === "error";
        onEvent(event);
      }
      cut = buffer.indexOf(BREAK);
    }
  };
  const pump = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += value.replaceAll("\r\n", "\n");
    drain();
    return pump();
  };
  try {
    await pump();
  } catch {
    if (signal.aborted) {
      return;
    }
  }
  if (!(finished || signal.aborted)) {
    onEvent({ code: "interrupted", message: "", type: "error" });
  }
};

export const checkHealth = async (signal?: AbortSignal) => {
  try {
    const response = await fetch(HEALTH_URL, { signal });
    return response.ok;
  } catch {
    return false;
  }
};
