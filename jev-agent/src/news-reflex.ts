import { createHash } from "node:crypto";
import { experimental_evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";

/**
 * News reflex: polls crypto news feeds and has Jev classify every new headline in ~0.3 s.
 * A headline judged a severe threat to a coin we trade (hack, insolvency, delisting, withdrawal halt,
 * enforcement) cuts that coin, or every coin for a market-wide threat, for NEWS_CUT_HOURS.
 * Reduce-only: it can never add exposure; the next scheduled rebalance after the cut expires restores it.
 */

export interface Headline { id: string; title: string; link: string; source: string; published: number }
export interface Verdict { coin: string; impact: "severe" | "negative" | "neutral" | "positive"; confidence: number; latencyMs: number }
export interface Classifier { readonly name: string; classify(h: Headline, coins: string[]): Promise<Verdict> }

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#8217;/g, "'").trim();

/** Minimal RSS 2.0 / Atom parser: titles, links and dates are all we need. */
export function parseFeed(xml: string, source: string): Headline[] {
  const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) ?? [];
  return items.map((it) => {
    const tag = (t: string) => { const m = it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ""; };
    const raw = tag("link") || (it.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "");
    const link = /^https?:\/\//i.test(raw) ? raw : ""; // feeds are untrusted: never pass javascript: or data: links on
    const title = tag("title");
    const published = Date.parse(tag("pubDate") || tag("published") || tag("updated") || tag("dc:date")) || Date.now();
    return { id: createHash("sha1").update(link || title).digest("hex").slice(0, 16), title, link, source, published };
  }).filter((h) => h.title);
}

const SEVERE = /\b(hack(ed)?|exploit(ed)?|drain(ed)?|stolen|breach|insolven\w*|bankrupt\w*|delist\w*|halts? withdrawals?|withdrawals? (halted|paused|suspended)|freez\w* (funds|withdrawals)|sec (sues|charges)|lawsuit against|ban(s|ned)?\b|seiz\w*|collapse\w*|depeg\w*|rug ?pull)\b/i;
const NEGATIVE = /\b(plunge\w*|crash\w*|dump\w*|liquidat\w*|outflows?|investigat\w*|probe|fine[sd]?|warn\w*|fud)\b/i;
const POSITIVE = /\b(approv\w*|etf inflows?|surge\w*|rall(y|ies)|record high|all-time high|partnership|adopt\w*)\b/i;
const NAMES: Record<string, string[]> = {
  BTC: ["bitcoin", "btc"], ETH: ["ethereum", "ether", "eth"], SOL: ["solana", "sol"], DOGE: ["dogecoin", "doge"],
  AVAX: ["avalanche", "avax"], LINK: ["chainlink", "link"],
};
const MARKET = /\b(crypto(currency)? (market|industry|exchange)|binance|coinbase|stablecoin|tether|usdt|usdc|exchange)\b/i;

/** Keyword fallback (MODEL=mock, or if Jev errors): conservative, only clear-cut wording counts as severe. */
export class KeywordClassifier implements Classifier {
  readonly name = "keywords";
  async classify(h: Headline, coins: string[]): Promise<Verdict> {
    const t = h.title.toLowerCase();
    const coin = coins.find((c) => (NAMES[c] ?? [c.toLowerCase()]).some((n) => new RegExp(`\\b${n}\\b`, "i").test(t))) ?? (MARKET.test(t) ? "market" : "none");
    const impact = SEVERE.test(t) ? "severe" : NEGATIVE.test(t) ? "negative" : POSITIVE.test(t) ? "positive" : "neutral";
    return { coin, impact, confidence: impact === "severe" ? 0.75 : 0.6, latencyMs: 0 };
  }
}

/** Jev: two typed questions answered in one parallel pass. */
export class JevNewsClassifier implements Classifier {
  readonly name: string;
  private model;
  constructor(modelId: string) { this.name = modelId; this.model = typeSafeAi.evaluationModel(modelId); }

  async classify(h: Headline, coins: string[]): Promise<Verdict> {
    const t0 = performance.now();
    const coinCriteria: Record<string, string> = Object.fromEntries(coins.map((c) => [c, `The headline is mainly about ${c} (${(NAMES[c] ?? [c]).join("/")}) specifically.`]));
    coinCriteria.market = "It affects the whole crypto market (a major exchange, stablecoin, regulation of crypto in general), not one coin.";
    coinCriteria.none = "It is not relevant to these coins or the crypto market.";
    const r = await experimental_evaluate({
      model: this.model,
      state: { headline: h.title, source: h.source, publishedMinutesAgo: Math.round((Date.now() - h.published) / 60_000), coinsWeHold: coins } as any,
      questions: {
        coin: { type: "choice", instructions: { question: "Which asset does this crypto news headline mainly concern?" }, criteria: coinCriteria },
        impact: {
          type: "choice",
          instructions: { question: "What is the likely price impact on that asset over the next few hours?", goal: "Protect a long-only crypto portfolio from sudden crashes. Reserve 'severe' for concrete events." },
          criteria: {
            severe: "A concrete event likely to cause a sharp drop (>5%) within hours: a hack or exploit, insolvency or bankruptcy, a delisting, a withdrawal halt, enforcement action or a ban, a stablecoin depeg, an exchange collapse.",
            negative: "Bad news, but not an acute threat: price falls, outflows, investigations, warnings, opinions.",
            neutral: "Informational, mixed, or no clear price effect.",
            positive: "Good news: approvals, inflows, adoption, partnerships, rallies.",
          },
        },
      } as any,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(5000),
    });
    const a: any = r.answers;
    const impact = a.impact.choice as Verdict["impact"];
    return { coin: String(a.coin.choice), impact, confidence: a.impact.probabilities?.[impact] ?? 1, latencyMs: performance.now() - t0 };
  }
}

export interface ReflexOpts { feeds: string[]; pollSec: number; maxAgeMin: number; severeConfidence: number; cutTo: number; cutHours: number }

export class NewsReflex {
  private seen = new Set<string>();
  private cuts = new Map<string, { until: number; to: number; title: string; at: number }>();
  recent: (Headline & Verdict & { action: string })[] = [];
  stats = { polls: 0, headlines: 0, classified: 0, severe: 0, errors: 0, lastError: "", lastPoll: 0 };
  private fallback = new KeywordClassifier();
  private timer?: NodeJS.Timeout;

  constructor(
    private o: ReflexOpts, private coins: string[], private classifier: Classifier,
    /** Called when a cut is applied, so the strategy can act immediately. */
    private onCut: (coins: string[], reason: string) => void,
    private fetcher: (url: string) => Promise<string> = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "jev-agent/1.0" } }); if (!r.ok) throw new Error(`${new URL(u).host}: ${r.status}`); return r.text(); },
    private now: () => number = Date.now,
  ) {}

  /** Multiplier (0..1) for a coin; 1 when no cut is active. Market-wide cuts apply to every coin. */
  multiplier(coin: string) {
    let m = 1;
    for (const k of [coin, "market"]) { const c = this.cuts.get(k); if (c && c.until > this.now()) m = Math.min(m, c.to); }
    return m;
  }
  activeCuts() { return [...this.cuts].filter(([, c]) => c.until > this.now()).map(([coin, c]) => ({ coin, ...c })); }

  async poll() {
    this.stats.polls++; this.stats.lastPoll = this.now();
    const fresh: Headline[] = [];
    await Promise.all(this.o.feeds.map(async (url) => {
      try {
        for (const h of parseFeed(await this.fetcher(url), new URL(url).host)) {
          if (this.seen.has(h.id)) continue;
          this.seen.add(h.id);
          // Old news is already in the price (and on startup every item looks "new").
          if (this.now() - h.published <= this.o.maxAgeMin * 60_000) fresh.push(h);
        }
      } catch (e) { this.stats.errors++; this.stats.lastError = (e as Error).message.slice(0, 200); }
    }));
    if (this.seen.size > 20_000) this.seen = new Set([...this.seen].slice(-10_000));
    this.stats.headlines += fresh.length;
    for (const h of fresh) await this.handle(h);
  }

  private async handle(h: Headline) {
    let v: Verdict;
    try { v = await this.classifier.classify(h, this.coins); }
    catch (e) { this.stats.errors++; this.stats.lastError = `classify: ${(e as Error).message.slice(0, 150)}`; v = await this.fallback.classify(h, this.coins); }
    this.stats.classified++;
    let action = "none";
    if (v.impact === "severe" && v.confidence >= this.o.severeConfidence && v.coin !== "none") {
      const targets = v.coin === "market" ? ["market"] : this.coins.includes(v.coin) ? [v.coin] : [];
      if (targets.length) {
        this.stats.severe++;
        for (const k of targets) this.cuts.set(k, { until: this.now() + this.o.cutHours * 3600_000, to: this.o.cutTo, title: h.title, at: this.now() });
        action = `cut ${targets.join(",")} to x${this.o.cutTo} for ${this.o.cutHours}h`;
        this.onCut(targets, `${h.source}: ${h.title}`);
      }
    }
    this.recent.unshift({ ...h, ...v, action });
    this.recent.length = Math.min(this.recent.length, 30);
  }

  start() {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.o.pollSec * 1000);
    this.timer.unref();
  }
  stop() { clearInterval(this.timer); }
}
