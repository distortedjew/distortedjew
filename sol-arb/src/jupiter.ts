export interface Quote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string; ammKey: string } }[];
  [k: string]: unknown;
}

export interface JupInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string; // base64
}

export interface SwapInstructions {
  setupInstructions: JupInstruction[];
  swapInstruction: JupInstruction;
  cleanupInstruction?: JupInstruction | null;
  otherInstructions?: JupInstruction[];
  addressLookupTableAddresses: string[];
}

export class Jupiter {
  constructor(private baseUrl: string, private apiKey = "", private timeoutMs = 2500) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) throw new Error(`jupiter ${path.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  quote(p: { inputMint: string; outputMint: string; amount: bigint; slippageBps: number; maxAccounts: number }) {
    const q = new URLSearchParams({
      inputMint: p.inputMint,
      outputMint: p.outputMint,
      amount: p.amount.toString(),
      slippageBps: String(p.slippageBps),
      maxAccounts: String(p.maxAccounts),
      restrictIntermediateTokens: "true",
    });
    return this.req<Quote>(`/quote?${q}`);
  }

  swapInstructions(quoteResponse: Quote, userPublicKey: string) {
    return this.req<SwapInstructions>("/swap-instructions", {
      method: "POST",
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        // Keep SOL as wSOL between legs; unwrapping mid-cycle would break leg 2.
        wrapAndUnwrapSol: false,
        dynamicComputeUnitLimit: false,
      }),
    });
  }
}
