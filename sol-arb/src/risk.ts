export interface RiskLimits {
  maxTradesPerMin: number;
  dailyLossLimitSol: number;
  maxConsecutiveFailures: number;
  minSolBalance: number;
}

/** Hard stops. Once tripped for the day (or by failures) the bot keeps quoting but never sends. */
export class Risk {
  private sends: number[] = [];
  private day = "";
  private netSol = 0; // profit minus fees, in SOL, for the current UTC day
  private failures = 0;
  haltReason = "";

  constructor(private limits: RiskLimits, private now = () => Date.now()) {}

  private rollDay() {
    const d = new Date(this.now()).toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.netSol = 0;
      if (this.haltReason.startsWith("daily")) this.haltReason = "";
    }
  }

  /** Returns why a send is blocked, or "" if it may go ahead. */
  check(solBalance: number): string {
    this.rollDay();
    if (this.haltReason) return this.haltReason;
    if (solBalance < this.limits.minSolBalance) return `SOL balance ${solBalance.toFixed(4)} below MIN_SOL_BALANCE`;
    const t = this.now();
    this.sends = this.sends.filter((s) => t - s < 60_000);
    if (this.sends.length >= this.limits.maxTradesPerMin) return "MAX_TRADES_PER_MIN reached";
    return "";
  }

  recordSend() {
    this.sends.push(this.now());
  }

  /** feeSol: what the attempt cost; profitSol: base-token gain converted to SOL (negative on loss). */
  recordResult(landed: boolean, feeSol: number, profitSol: number) {
    this.rollDay();
    this.netSol += profitSol - feeSol;
    this.failures = landed ? 0 : this.failures + 1;
    if (this.netSol <= -this.limits.dailyLossLimitSol) this.haltReason = `daily loss limit hit (${this.netSol.toFixed(5)} SOL)`;
    else if (this.failures >= this.limits.maxConsecutiveFailures) this.haltReason = `${this.failures} consecutive failed attempts — restart to resume`;
  }

  get dailyNetSol() {
    this.rollDay();
    return this.netSol;
  }
}
