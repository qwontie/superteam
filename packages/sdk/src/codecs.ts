import {
  addCodecSizePrefix,
  getAddressCodec,
  getArrayCodec,
  getBooleanCodec,
  getDiscriminatedUnionCodec,
  getI64Codec,
  getLiteralUnionCodec,
  getNullableCodec,
  getStructCodec,
  getU8Codec,
  getU16Codec,
  getU32Codec,
  getU64Codec,
  getUtf8Codec,
} from "@solana/kit";

const stringCodec = addCodecSizePrefix(getUtf8Codec(), getU32Codec());

export const conditionCodec = getDiscriminatedUnionCodec([
  ["After", getStructCodec([["ts", getI64Codec()]])],
  ["Signed", getStructCodec([["party", getU8Codec()]])],
  ["Unsigned", getStructCodec([["party", getU8Codec()]])],
  ["Attested", getStructCodec([["check", getU8Codec()]])],
]);

export const payoutCodec = getStructCodec([
  ["party", getU8Codec()],
  ["bps", getU16Codec()],
]);

export const ruleCodec = getStructCodec([
  ["when", getArrayCodec(conditionCodec)],
  ["pay", getArrayCodec(payoutCodec)],
]);

export const checkSpecCodec = getStructCodec([
  ["kind", getU8Codec()],
  ["target", stringCodec],
  ["expect", stringCodec],
  ["witnesses", getArrayCodec(getAddressCodec())],
  ["threshold", getU8Codec()],
]);

export const checkCodec = getStructCodec([
  ["kind", getU8Codec()],
  ["target", stringCodec],
  ["expect", stringCodec],
  ["witnesses", getArrayCodec(getAddressCodec())],
  ["threshold", getU8Codec()],
  ["yes", getU8Codec()],
  ["no", getU8Codec()],
]);

export const dealStatusCodec = getLiteralUnionCodec([
  "draft",
  "funded",
  "settled",
  "cancelled",
]);

export const dealCodec = getStructCodec([
  ["creator", getAddressCodec()],
  ["dealId", getU64Codec()],
  ["title", stringCodec],
  ["parties", getArrayCodec(getAddressCodec())],
  ["funder", getU8Codec()],
  ["amount", getU64Codec()],
  ["status", dealStatusCodec],
  ["settledRule", getNullableCodec(getU8Codec())],
  ["signals", getArrayCodec(getNullableCodec(getI64Codec()))],
  ["checks", getArrayCodec(checkCodec)],
  ["rules", getArrayCodec(ruleCodec)],
  ["bump", getU8Codec()],
]);

export const createDealArgsCodec = getStructCodec([
  ["dealId", getU64Codec()],
  ["title", stringCodec],
  ["parties", getArrayCodec(getAddressCodec())],
  ["funder", getU8Codec()],
  ["amount", getU64Codec()],
  ["checks", getArrayCodec(checkSpecCodec)],
  ["rules", getArrayCodec(ruleCodec)],
]);

export const attestArgsCodec = getStructCodec([
  ["check", getU8Codec()],
  ["verdict", getBooleanCodec()],
]);

export const executeArgsCodec = getStructCodec([["rule", getU8Codec()]]);

export type CreateDealArgs = Parameters<typeof createDealArgsCodec.encode>[0];
export type DealAccount = ReturnType<typeof dealCodec.decode>;
export type RuleArgs = Parameters<typeof ruleCodec.encode>[0];
export type ConditionArgs = Parameters<typeof conditionCodec.encode>[0];
