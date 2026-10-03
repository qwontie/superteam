import { createClient, type MicroLamports } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";

const HTTP_SCHEME = /^http/;

export const CLUSTER = "devnet";
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";
const WS_URL =
  import.meta.env.VITE_WS_URL || RPC_URL.replace(HTTP_SCHEME, "ws");

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
