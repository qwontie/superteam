import { createClient, type MicroLamports } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";

export const CLUSTER = "devnet";
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "wss://api.devnet.solana.com";

export function createAppClient() {
  return createClient()
    .use(walletSigner({ chain: "solana:devnet" }))
    .use(
      solanaRpc({
        rpcSubscriptionsUrl: WS_URL,
        rpcUrl: RPC_URL,
        transactionConfig: {
          microLamportsPerComputeUnit: 1000n as MicroLamports,
        },
      })
    );
}

export type AppClient = ReturnType<typeof createAppClient>;

export function explorerUrl(path: string) {
  return `https://explorer.solana.com${path}?cluster=${CLUSTER}`;
}
