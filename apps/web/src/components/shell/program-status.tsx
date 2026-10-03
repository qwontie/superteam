import { PACT_PROGRAM_ID } from "@pact/sdk";
import { getAddressDecoder, getBase64Encoder } from "@solana/kit";
import { useQuery } from "@tanstack/react-query";
import type { AppClient } from "@/lib/solana";
import { useAppClient } from "@/lib/use-app-client";

type Authority = "none" | "open";

const POINTER_START = 4;
const POINTER_END = 36;
const AUTHORITY_FLAG = 12;
const STALE_MS = 300_000;

const TEXT: Record<Authority, string> = {
  none: "Immutable program, no fee, no database.",
  open: "Upgrade key open until launch. No fee, no database.",
};

const readBytes = async (
  client: AppClient,
  account: string,
  length: number
) => {
  const info = await client.rpc
    .getAccountInfo(account as typeof PACT_PROGRAM_ID, {
      dataSlice: { length, offset: 0 },
      encoding: "base64",
    })
    .send();
  if (!info.value) {
    throw new Error("account not found");
  }
  return getBase64Encoder().encode(info.value.data[0]);
};

const readAuthority = async (client: AppClient): Promise<Authority> => {
  const program = await readBytes(client, PACT_PROGRAM_ID, POINTER_END);
  const programData = getAddressDecoder().decode(
    program.slice(POINTER_START, POINTER_END)
  );
  const header = await readBytes(client, programData, AUTHORITY_FLAG + 1);
  return header[AUTHORITY_FLAG] === 0 ? "none" : "open";
};

export function ProgramStatus() {
  const client = useAppClient();
  const authority = useQuery({
    queryFn: () => readAuthority(client),
    queryKey: ["program-authority"],
    staleTime: STALE_MS,
  });
  return (
    <span>
      Solana devnet.{" "}
      {authority.data ? TEXT[authority.data] : "No fee, no database."}
    </span>
  );
}
