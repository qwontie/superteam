import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AccountRole,
  type AccountSignerMeta,
  address,
  getU32Encoder,
  getU64Encoder,
  type Instruction,
} from "@solana/kit";
import {
  agentsDir,
  rpc,
  send,
  sol,
  WALLETS,
  type WalletName,
  wallets,
} from "./demo-common";

const SOL = 1_000_000_000n;
const milli = (value: number) => (BigInt(value) * SOL) / 1000n;

const NEEDS: Record<
  Exclude<WalletName, "treasury">,
  { min: bigint; target: bigint; why: string }
> = {
  client: {
    min: milli(400),
    target: milli(700),
    why: "funds 5 demo deals (0.02 each), rent of 6 (0.012 each), one live deal from the builder, fees",
  },
  freelancer: {
    min: milli(30),
    target: milli(100),
    why: "fees for signals and executes on stage",
  },
  witness1: {
    min: milli(50),
    target: milli(150),
    why: "node votes and executes all night, demo-deals votes",
  },
  witness2: {
    min: milli(50),
    target: milli(150),
    why: "node votes and executes all night, demo-deals votes",
  },
  witness3: {
    min: milli(50),
    target: milli(150),
    why: "node votes and executes all night, demo-deals executes",
  },
};
const TREASURY_RESERVE = milli(500);

const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const TRANSFER = 2;
const burnLog = join(agentsDir, "reports", "demo-treasury.log");

const transfer = (
  from: Parameters<typeof send>[1],
  to: string,
  lamports: bigint
): Instruction => {
  const payer: AccountSignerMeta = {
    address: from.address,
    role: AccountRole.WRITABLE_SIGNER,
    signer: from,
  };
  return {
    accounts: [payer, { address: address(to), role: AccountRole.WRITABLE }],
    data: new Uint8Array([
      ...getU32Encoder().encode(TRANSFER),
      ...getU64Encoder().encode(lamports),
    ]),
    programAddress: SYSTEM_PROGRAM,
  };
};

const balances = async () => {
  const signers = await wallets();
  const values = await Promise.all(
    WALLETS.map((name) => rpc.getBalance(signers[name].address).send())
  );
  return {
    signers,
    values: Object.fromEntries(
      WALLETS.map((name, index) => [name, BigInt(values[index]?.value ?? 0n)])
    ) as Record<WalletName, bigint>,
  };
};

const reportBurn = (treasury: bigint, total: bigint) => {
  mkdirSync(join(agentsDir, "reports"), { recursive: true });
  const now = new Date();
  const rows = existsSync(burnLog)
    ? readFileSync(burnLog, "utf8").trim().split("\n").filter(Boolean)
    : [];
  appendFileSync(burnLog, `${now.toISOString()} ${treasury} ${total}\n`);
  const first = rows[0]?.split(" ");
  if (!first) {
    console.log(
      `\nburn: first sample written to ${burnLog}, run again later for a rate`
    );
    return;
  }
  const hours = (now.getTime() - Date.parse(first[0] ?? "")) / 3_600_000;
  const spent = BigInt(first[2] ?? "0") - total;
  const treasurySpent = BigInt(first[1] ?? "0") - treasury;
  const perHour = hours > 0 ? Number(spent) / 1e9 / hours : 0;
  console.log(
    `\nsince ${first[0]} (${hours.toFixed(1)} h): treasury -${sol(treasurySpent)} SOL, all six wallets -${sol(spent)} SOL (${perHour.toFixed(4)} SOL/h; counts SOL locked in open deals and spent by every thread using these wallets)`
  );
  const runway =
    perHour > 0 ? Number(total) / 1e9 / perHour : Number.POSITIVE_INFINITY;
  console.log(
    `treasury ${sol(treasury)} SOL, all wallets ${sol(total)} SOL, ${Number.isFinite(runway) ? `about ${runway.toFixed(0)} h at this rate` : "no net burn yet"}`
  );
  if (treasury < TREASURY_RESERVE) {
    console.log(
      `treasury below ${sol(TREASURY_RESERVE)} SOL: ask a mentor for devnet SOL to 3p4TEJLZo7mA1pqcK8bRiLtNd1kVEPAHRLSwzwcRoHrQ`
    );
  }
};

const check = async () => {
  const { values } = await balances();
  let short = 0;
  console.log(
    `${"wallet".padEnd(11)} ${"balance".padStart(9)} ${"min".padStart(7)}  state`
  );
  for (const name of WALLETS) {
    const balance = values[name];
    if (name === "treasury") {
      const ok = balance >= TREASURY_RESERVE;
      console.log(
        `${name.padEnd(11)} ${sol(balance).padStart(9)} ${sol(TREASURY_RESERVE).padStart(7)}  ${ok ? "ok" : "LOW"}  reserve for top-ups`
      );
      continue;
    }
    const need = NEEDS[name];
    const ok = balance >= need.min;
    short += ok ? 0 : 1;
    console.log(
      `${name.padEnd(11)} ${sol(balance).padStart(9)} ${sol(need.min).padStart(7)}  ${ok ? "ok " : "LOW"}  ${need.why}`
    );
  }
  const total = WALLETS.reduce((sum, name) => sum + values[name], 0n);
  reportBurn(values.treasury, total);
  if (short > 0) {
    console.log(`\n${short} wallet(s) below the minimum: make demo-topup`);
  }
  return short;
};

const topup = async () => {
  const { signers, values } = await balances();
  const transfers: [string, bigint][] = [];
  for (const name of WALLETS) {
    if (name === "treasury") {
      continue;
    }
    const need = NEEDS[name];
    if (values[name] < need.target) {
      transfers.push([name, need.target - values[name]]);
    }
  }
  const wanted = transfers.reduce((sum, [, lamports]) => sum + lamports, 0n);
  if (wanted === 0n) {
    console.log("every wallet is at its target, nothing to send");
  } else if (values.treasury - wanted < milli(50)) {
    console.log(
      `treasury has ${sol(values.treasury)} SOL, the top-up needs ${sol(wanted)} SOL: ask a mentor for devnet SOL first`
    );
    process.exit(1);
  } else {
    const instructions = transfers.map(([name, lamports]) => {
      console.log(`  ${name} +${sol(lamports)} SOL`);
      return transfer(
        signers.treasury,
        signers[name as WalletName].address,
        lamports
      );
    });
    await send("top-up from treasury", signers.treasury, instructions);
  }
  await check();
};

const [, , command] = process.argv;
if (command === "topup") {
  await topup();
} else {
  const short = await check();
  process.exit(short > 0 ? 1 : 0);
}
process.exit(0);
