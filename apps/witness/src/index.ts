import { PACT_PROGRAM_ID } from "@pact/sdk";

const cluster = process.env.CLUSTER_URL ?? "https://api.devnet.solana.com";

console.log(`cluster: ${cluster}`);
console.log(`program: ${PACT_PROGRAM_ID}`);
