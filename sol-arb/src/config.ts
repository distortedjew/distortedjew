// systemd's EnvironmentFile keeps inline "# comments" as part of the value, so strip them here.
const env = (k: string, d: string) => (process.env[k] ?? "").replace(/\s+#.*$/, "").trim() || d;
const num = (k: string, d: number) => {
  const v = Number(env(k, String(d)));
  if (!Number.isFinite(v)) throw new Error(`${k} must be a number, got "${process.env[k]}"`);
  return v;
};
const list = (k: string, d: string) => env(k, d).split(",").map((s) => s.trim()).filter(Boolean);

export const MINTS = {
  SOL: "So11111111111111111111111111111111111111112", // wrapped SOL
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JTO: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
} as const;

/** Accepts a symbol from MINTS or a raw mint address. */
export const resolveMint = (s: string) => (MINTS as Record<string, string>)[s.toUpperCase()] ?? s;

export function loadConfig() {
  const baseMint = resolveMint(env("BASE_MINT", "USDC"));
  return {
    rpcUrl: env("RPC_URL", "https://api.mainnet-beta.solana.com"),
    /** base58 secret key, a JSON byte array, or a path to a solana-keygen JSON file. */
    wallet: env("WALLET", ""),
    jupiterUrl: env("JUPITER_URL", "https://lite-api.jup.ag/swap/v1"),
    jupiterApiKey: env("JUPITER_API_KEY", ""),

    /** off = quote and log opportunities only; on = sign and send real transactions. */
    live: env("LIVE", "off") === "on",
    tickMs: num("TICK_MS", 1000),

    /** The token the bot starts and ends each cycle in (USDC -> X -> USDC). Must be an SPL token you hold. */
    baseMint,
    baseDecimals: num("BASE_DECIMALS", 6),
    /** Trade size per cycle, in whole base units (e.g. 50 = 50 USDC). */
    tradeSize: num("TRADE_SIZE", 50),
    intermediates: list("INTERMEDIATES", "SOL,USDT,JUP,BONK,JTO,WIF").map(resolveMint).filter((m) => m !== baseMint),

    /** Minimum profit after all fees, in whole base units, before a cycle is taken. */
    minProfit: num("MIN_PROFIT", 0.02),
    /** Leg 1 slippage. 0 = leg 1 reverts the whole tx if its price moved against us at all. */
    leg1SlippageBps: num("LEG1_SLIPPAGE_BPS", 0),
    /** Cap Jupiter route size per leg so both legs fit in one 1232-byte transaction. */
    maxAccountsPerLeg: num("MAX_ACCOUNTS_PER_LEG", 24),

    computeUnitLimit: num("COMPUTE_UNIT_LIMIT", 600_000),
    priorityMicroLamports: num("PRIORITY_MICROLAMPORTS", 20_000),
    /** Send through Jito: a tx that would revert is simply dropped, so failed attempts cost nothing. */
    jito: env("JITO", "on") === "on",
    jitoUrl: env("JITO_URL", "https://mainnet.block-engine.jito.wtf/api/v1/transactions?bundleOnly=true"),
    jitoTipLamports: num("JITO_TIP_LAMPORTS", 10_000),
    /** Simulate before sending (adds latency, but never pays for a tx that would revert). */
    simulate: env("SIMULATE", "on") === "on",

    risk: {
      maxTradesPerMin: num("MAX_TRADES_PER_MIN", 10),
      /** Stop for the day once SOL spent on fees/tips minus profit exceeds this. */
      dailyLossLimitSol: num("DAILY_LOSS_LIMIT_SOL", 0.05),
      maxConsecutiveFailures: num("MAX_CONSECUTIVE_FAILURES", 8),
      /** Never let the wallet's SOL drop below this (fees need it). */
      minSolBalance: num("MIN_SOL_BALANCE", 0.02),
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
