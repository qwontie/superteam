import { type Address, address } from "@solana/kit";
import idl from "./idl/pact.json" with { type: "json" };

export type { Pact } from "./idl/pact";

export const PACT_IDL = idl;
export const PACT_PROGRAM_ID: Address = address(idl.address);
