import { PRICE_PAIRS } from "@pact/sdk/facts";
import { STARTER_FACT_LABELS } from "@/features/builder/starters";

export type FactOp = "exists" | "equals" | "above" | "below" | "contains";

export type FactShape =
  | { text: string; type: "page"; url: string }
  | { op: FactOp; path: string; type: "json"; url: string; value: string }
  | { op: FactOp; pair: string; type: "price"; value: string }
  | {
      entity: string;
      op: FactOp;
      property: string;
      type: "wikidata";
      value: string;
    };

export const PAIRS = Object.keys(PRICE_PAIRS);

export const OPS: Record<
  Exclude<FactShape["type"], "page">,
  readonly FactOp[]
> = {
  json: ["equals", "above", "below", "contains"],
  price: ["above", "below"],
  wikidata: ["exists", "equals", "above", "below"],
};

export const OP_WORD: Record<FactOp, string> = {
  above: "is above",
  below: "is below",
  contains: "contains",
  equals: "equals",
  exists: "exists",
};

const PRICE = "price:";
const WIKIDATA = "wikidata:";
const SIGN: Record<string, FactOp> = {
  "<": "below",
  "=": "equals",
  ">": "above",
  "~": "contains",
};
const MARK: Record<FactOp, string> = {
  above: ">",
  below: "<",
  contains: "~",
  equals: "=",
  exists: "exists",
};

const readExpect = (expect: string): { op: FactOp; value: string } => {
  if (expect === MARK.exists) {
    return { op: "exists", value: "" };
  }
  const op = SIGN[expect.charAt(0)];
  return op ? { op, value: expect.slice(1) } : { op: "equals", value: expect };
};

const writeExpect = (op: FactOp, value: string) =>
  op === "exists" ? MARK.exists : `${MARK[op]}${value}`;

export const factShape = (target: string, expect: string): FactShape => {
  if (target.startsWith(PRICE)) {
    const { op, value } = readExpect(expect);
    return {
      op: op === "below" ? "below" : "above",
      pair: target.slice(PRICE.length),
      type: "price",
      value,
    };
  }
  if (target.startsWith(WIKIDATA)) {
    const [entity = "", property = ""] = target
      .slice(WIKIDATA.length)
      .split("/");
    return { ...readExpect(expect), entity, property, type: "wikidata" };
  }
  const cut = target.indexOf("#");
  if (cut >= 0) {
    return {
      ...readExpect(expect),
      path: target.slice(cut + 1),
      type: "json",
      url: target.slice(0, cut),
    };
  }
  return { text: expect, type: "page", url: target };
};

export const writeFact = (
  fact: FactShape
): { expect: string; target: string } => {
  switch (fact.type) {
    case "price":
      return {
        expect: writeExpect(fact.op, fact.value),
        target: `${PRICE}${fact.pair}`,
      };
    case "wikidata":
      return {
        expect: writeExpect(fact.op, fact.value),
        target: `${WIKIDATA}${fact.entity}/${fact.property}`,
      };
    case "json":
      return {
        expect: writeExpect(fact.op, fact.value),
        target: `${fact.url.trim()}#${fact.path.trim()}`,
      };
    default:
      return { expect: fact.text, target: fact.url.trim() };
  }
};

const needsValue = (fact: { op: FactOp; value: string }) =>
  fact.op !== "exists" && fact.value.trim() === "";

export const factGap = (fact: FactShape) => {
  switch (fact.type) {
    case "price":
      return needsValue(fact);
    case "wikidata":
      return fact.entity === "" || needsValue(fact);
    case "json":
      return (
        fact.url.trim() === "" || fact.path.trim() === "" || needsValue(fact)
      );
    default:
      return fact.url.trim() === "" || fact.text.trim() === "";
  }
};

const SEARCH = "https://www.wikidata.org/w/api.php";
const LIMIT = "6";

export interface WikidataHit {
  description: string;
  id: string;
  label: string;
}

interface SearchReply {
  search?: { description?: string; id: string; label?: string }[];
}

export const searchWikidata = async (
  text: string,
  signal?: AbortSignal
): Promise<WikidataHit[]> => {
  const query = new URLSearchParams({
    action: "wbsearchentities",
    format: "json",
    language: "en",
    limit: LIMIT,
    origin: "*",
    search: text,
    type: "item",
  });
  const reply = await fetch(`${SEARCH}?${query}`, { signal });
  if (!reply.ok) {
    throw new Error("Wikidata did not answer");
  }
  const body = (await reply.json()) as SearchReply;
  return (body.search ?? []).map((hit) => ({
    description: hit.description ?? "",
    id: hit.id,
    label: hit.label ?? hit.id,
  }));
};

const labels = new Map<string, string>(Object.entries(STARTER_FACT_LABELS));

export const knownLabel = (entity: string) => labels.get(entity);

export const rememberLabel = (entity: string, label: string) => {
  labels.set(entity, label);
};
