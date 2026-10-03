export type Cluster = "devnet" | "mainnet-beta" | "localnet";

const EXPLORER = "https://explorer.solana.com";
const LOCAL_RPC = "http://localhost:8899";

const clusterQuery = (cluster: Cluster) => {
  if (cluster === "mainnet-beta") {
    return "";
  }
  if (cluster === "localnet") {
    return `?cluster=custom&customUrl=${encodeURIComponent(LOCAL_RPC)}`;
  }
  return `?cluster=${cluster}`;
};

export const explorerTx = (signature: string, cluster: Cluster = "devnet") =>
  `${EXPLORER}/tx/${signature}${clusterQuery(cluster)}`;

export const explorerAddress = (address: string, cluster: Cluster = "devnet") =>
  `${EXPLORER}/address/${address}${clusterQuery(cluster)}`;
