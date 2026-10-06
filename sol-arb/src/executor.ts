import { readFileSync, existsSync } from "node:fs";
import bs58 from "bs58";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Config } from "./config.js";
import type { Opportunity } from "./arb.js";
import type { JupInstruction, Jupiter, SwapInstructions } from "./jupiter.js";

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
];

export function loadKeypair(wallet: string): Keypair {
  const raw = existsSync(wallet) ? readFileSync(wallet, "utf8").trim() : wallet.trim();
  if (!raw) throw new Error("WALLET is empty");
  return Keypair.fromSecretKey(raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw));
}

export const ata = (owner: PublicKey, mint: PublicKey) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];

export const toIx = (i: JupInstruction) =>
  new TransactionInstruction({
    programId: new PublicKey(i.programId),
    keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(i.data, "base64"),
  });

/** Both legs usually emit the same idempotent create-ATA setup; keep one copy of each. */
export function dedupe(ixs: (JupInstruction | null | undefined)[]): JupInstruction[] {
  const seen = new Set<string>();
  return ixs.filter((i): i is JupInstruction => {
    if (!i) return false;
    const k = JSON.stringify(i);
    return !seen.has(k) && !!seen.add(k);
  });
}

/** Order: compute budget, setups, leg 1, leg 2, cleanups (never between the legs), tip last. */
export function assemble(a: SwapInstructions, b: SwapInstructions, cfg: Pick<Config, "computeUnitLimit" | "priorityMicroLamports" | "jito" | "jitoTipLamports">, payer: PublicKey) {
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cfg.computeUnitLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cfg.priorityMicroLamports }),
    ...dedupe([...a.setupInstructions, ...b.setupInstructions]).map(toIx),
    toIx(a.swapInstruction),
    toIx(b.swapInstruction),
    ...dedupe([a.cleanupInstruction, b.cleanupInstruction]).map(toIx),
  ];
  if (cfg.jito) {
    const tipTo = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
    ixs.push(SystemProgram.transfer({ fromPubkey: payer, toPubkey: tipTo, lamports: cfg.jitoTipLamports }));
  }
  return ixs;
}

export type ExecResult =
  | { status: "skipped"; reason: string } // nothing sent, nothing paid
  | { status: "landed"; signature: string }
  | { status: "failed"; signature: string; reason: string };

export class Executor {
  private alts = new Map<string, AddressLookupTableAccount>();
  private blockhash: { blockhash: string; lastValidBlockHeight: number } | null = null;
  private timer?: NodeJS.Timeout;

  constructor(private conn: Connection, private jup: Jupiter, private kp: Keypair, private cfg: Config, private send: boolean) {}

  async start() {
    const refresh = async () => {
      try {
        this.blockhash = await this.conn.getLatestBlockhash("confirmed");
      } catch (e) {
        console.warn(`blockhash refresh failed: ${(e as Error).message}`);
      }
    };
    await refresh();
    this.timer = setInterval(refresh, 2000);
  }

  stop() {
    clearInterval(this.timer);
  }

  private async lookupTables(addrs: string[]) {
    const missing = [...new Set(addrs)].filter((a) => !this.alts.has(a));
    if (missing.length) {
      const infos = await this.conn.getMultipleAccountsInfo(missing.map((a) => new PublicKey(a)));
      infos.forEach((info, i) => {
        if (info) this.alts.set(missing[i], new AddressLookupTableAccount({ key: new PublicKey(missing[i]), state: AddressLookupTableAccount.deserialize(info.data) }));
      });
    }
    return [...new Set(addrs)].map((a) => this.alts.get(a)).filter((x): x is AddressLookupTableAccount => !!x);
  }

  async execute(opp: Opportunity): Promise<ExecResult> {
    if (!this.blockhash) return { status: "skipped", reason: "no blockhash yet" };
    const user = this.kp.publicKey.toBase58();
    const [a, b] = await Promise.all([this.jup.swapInstructions(opp.leg1, user), this.jup.swapInstructions(opp.leg2, user)]);
    const instructions = assemble(a, b, this.cfg, this.kp.publicKey);
    const alts = await this.lookupTables([...a.addressLookupTableAddresses, ...b.addressLookupTableAddresses]);

    const { blockhash, lastValidBlockHeight } = this.blockhash;
    let tx: VersionedTransaction;
    let raw: Uint8Array;
    try {
      const msg = new TransactionMessage({ payerKey: this.kp.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message(alts);
      tx = new VersionedTransaction(msg);
      tx.sign([this.kp]);
      raw = tx.serialize();
    } catch (e) {
      return { status: "skipped", reason: `tx too large or invalid: ${(e as Error).message.slice(0, 80)} (lower MAX_ACCOUNTS_PER_LEG)` };
    }
    if (raw.length > 1232) return { status: "skipped", reason: `tx is ${raw.length} bytes (> 1232)` };

    if (this.cfg.simulate || !this.send) {
      const sim = await this.conn.simulateTransaction(tx, { sigVerify: false, commitment: "processed" });
      if (sim.value.err) return { status: "skipped", reason: `simulation reverted: ${JSON.stringify(sim.value.err)}` };
      if (!this.send) return { status: "skipped", reason: `dry run — simulation OK (${sim.value.unitsConsumed ?? "?"} CU)` };
    }

    const signature = bs58.encode(tx.signatures[0]);
    if (this.cfg.jito) await this.sendJito(raw);
    else await this.conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 2 });
    return this.confirm(signature, lastValidBlockHeight);
  }

  private async sendJito(raw: Uint8Array) {
    const res = await fetch(this.cfg.jitoUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [Buffer.from(raw).toString("base64"), { encoding: "base64" }] }),
      signal: AbortSignal.timeout(3000),
    });
    const body = (await res.json()) as { error?: { message: string } };
    if (!res.ok || body.error) throw new Error(`jito: ${body.error?.message ?? res.status}`);
  }

  private async confirm(signature: string, lastValidBlockHeight: number): Promise<ExecResult> {
    for (;;) {
      await new Promise((r) => setTimeout(r, 800));
      const { value } = await this.conn.getSignatureStatuses([signature]);
      const s = value[0];
      if (s?.err) return { status: "failed", signature, reason: JSON.stringify(s.err) };
      if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return { status: "landed", signature };
      if ((await this.conn.getBlockHeight("confirmed")) > lastValidBlockHeight) return { status: "failed", signature, reason: "expired (not included)" };
    }
  }
}
