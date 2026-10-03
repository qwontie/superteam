const LAMPORTS_PER_SOL = 1_000_000_000n;
const SOL_DECIMALS = 9;
const SOL_AMOUNT = /^(\d+)(?:\.(\d{1,9}))?$/;
const TRAILING_ZEROS = /0+$/;

export const solToLamports = (sol: string) => {
  const match = SOL_AMOUNT.exec(sol.trim());
  if (!match) {
    throw new Error(`"${sol}" is not an amount of SOL with at most 9 decimals`);
  }
  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(SOL_DECIMALS, "0"));
  return whole * LAMPORTS_PER_SOL + fraction;
};

export const lamportsToSol = (lamports: bigint | string) => {
  const value = BigInt(lamports);
  const whole = value / LAMPORTS_PER_SOL;
  const fraction = (value % LAMPORTS_PER_SOL)
    .toString()
    .padStart(SOL_DECIMALS, "0")
    .replace(TRAILING_ZEROS, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};
