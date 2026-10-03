import { Agent } from "./agent.js";
import { AlpacaBroker, AlpacaFeed, binanceToAlpaca } from "./alpaca.js";
import { PaperBroker } from "./broker.js";
import { config } from "./config.js";
import { startDashboard } from "./dashboard.js";
import { BinanceFeed, SimFeed } from "./feeds.js";
import { MarketData } from "./market-data.js";
import { createModel } from "./model.js";
import { Strategist } from "./strategist.js";
import { Executor } from "./executor.js";
import { Notifier } from "./notify.js";
import { RiskOfficer } from "./overlay.js";
import { TrendTrader } from "./trend-trader.js";
import { JevNewsClassifier, KeywordClassifier, NewsReflex } from "./news-reflex.js";
import { Scorecard } from "./scorecard.js";
import type { Broker, Feed } from "./types.js";

const die = (m: string) => { console.error(m); process.exit(1); };
if (config.model === "jev" && !process.env.TYPESAFE_AI_API_KEY) die("MODEL=jev needs TYPESAFE_AI_API_KEY");
const needsAlpaca = config.feed === "alpaca" || config.broker === "alpaca";
if (needsAlpaca && !(config.alpaca.keyId && config.alpaca.secret)) die("Alpaca needs ALPACA_KEY_ID and ALPACA_SECRET_KEY (paper keys)");
if (config.strategy === "trend" && config.feed === "alpaca") die("STRATEGY=trend trades crypto with Binance symbols: use FEED=binance (orders can still go to BROKER=alpaca)");
if (config.broker === "alpaca" && config.feed === "sim") die("BROKER=alpaca needs real prices: use FEED=binance or FEED=alpaca");
if (config.broker === "alpaca" && config.feed === "binance") {
  const bad = config.symbols.filter((s) => !binanceToAlpaca(s));
  if (bad.length) die(`Can't map ${bad} to Alpaca crypto (use USD/USDT pairs like BTCUSDT)`);
}

const feed: Feed =
  config.feed === "alpaca" ? new AlpacaFeed(config.symbols, config.alpaca.keyId, config.alpaca.secret)
  : config.feed === "binance" ? new BinanceFeed(config.symbols, config.binanceWsUrl)
  : new SimFeed(config.symbols);

let broker: Broker;
if (config.broker === "alpaca") {
  const map = config.feed === "binance" ? (s: string) => binanceToAlpaca(s)! : undefined;
  const b = new AlpacaBroker(config.alpaca.keyId, config.alpaca.secret, map);
  await b.start().catch((e) => die(`Alpaca paper account unreachable: ${e.message}`));
  broker = b;
} else broker = new PaperBroker(config.startCash, config.feeBps, config.slippageBps, config.strategy === "trend" ? "logs/paper-broker.json" : undefined);

const model = createModel();
const agent = new Agent(config, model, broker, feed);
const notify = new Notifier(config.telegram.token, config.telegram.chatId);
const marketData = () => new MarketData({
  restUrl: config.binanceRestUrl, futuresUrl: config.binanceFuturesUrl,
  alphaVantageKey: config.alphaVantageKey, newsEveryMin: config.newsEveryMin,
});
let trend: TrendTrader | undefined;

if (config.strategy === "trend") {
  const t = config.trend;
  const exec = new Executor(
    { windowMin: t.execWindowMin, slices: t.execSlices, checkSec: t.execCheckSec, waitConfidence: t.jevWaitConfidence, minOrderUsd: config.risk.minOrderUsd },
    {
      model,
      state: (s) => agent.marketState(s),
      mid: (s) => agent.mid(s),
      positionUsd: (s) => agent.positionUsd(s),
      place: (s, side, usd, why, d) => agent.place(s, side, usd, why, d),
      onDecision: (s, mid, d) => { agent.stats.decisions++; agent.tel.addDecision(s, d); agent.tel.scoreOpen(s, mid, d, config.horizonSec, config.minConfidence); },
      onEvent: (kind, s, text, side) => agent.event(kind, s, text, side),
    },
  );
  agent.executor = exec;
  const officer = config.strategist.apiKey ? new RiskOfficer(config.strategist, config.symbols, marketData()) : undefined;
  trend = new TrendTrader(config, agent, exec, {
    binanceRestUrl: config.binanceRestUrl, alpacaKeyId: config.alpaca.keyId, alpacaSecret: config.alpaca.secret,
    toAlpaca: (s) => binanceToAlpaca(s),
  }, officer, notify);
  // News reflex: Jev classifies every new headline; a severe threat cuts that coin (or all) at once.
  const coins = config.symbols.map((s) => s.replace(/(USDT|USDC|USD)$/, ""));
  const reflex = config.news.enabled ? new NewsReflex(config.news, coins,
    config.model === "jev" ? new JevNewsClassifier(config.jevModelId) : new KeywordClassifier(),
    (hit, why) => {
      agent.event("kill", hit.join(","), `news reflex: cutting ${hit.join(", ")} — ${why}`);
      void notify.send(`NEWS REFLEX cut ${hit.join(", ")} to x${config.news.cutTo} for ${config.news.cutHours}h: ${why}`);
      void trend!.run("news");
    }) : undefined;
  trend.reflex = reflex;
  // Scorecard: Jev predicts every coin on a cadence without trading; graded after HORIZON_SEC.
  const scorecard = config.scorecard.enabled ? new Scorecard({
    model, symbols: config.symbols,
    state: (s) => agent.marketState(s),
    record: (s, mid, d) => { agent.stats.decisions++; agent.tel.addDecision(s, d); agent.tel.scoreOpen(s, mid, d, config.horizonSec, config.minConfidence); },
    onError: (m) => agent.event("error", "scorecard", m),
  }, config.scorecard.everySec) : undefined;
  reflex?.start();
  scorecard?.start();
  agent.extraSnapshot = () => ({
    ...trend!.snapshot(),
    news: reflex ? { classifier: config.model === "jev" ? config.jevModelId : "keywords", stats: reflex.stats, cuts: reflex.activeCuts(), recent: reflex.recent.slice(0, 12), feeds: config.news.feeds.length } : null,
    scorecard: scorecard ? { calls: scorecard.calls, errors: scorecard.errors, lastError: scorecard.lastError, everySec: config.scorecard.everySec, horizonSec: config.horizonSec, roundTripBps: 2 * config.feeBps } : null,
  });
  let wasHalted = false;
  setInterval(() => {
    if (agent.risk.halted && !wasHalted) void notify.send("KILL SWITCH: daily loss limit hit, positions flattened, buys halted until 00:00 UTC");
    wasHalted = agent.risk.halted;
  }, 5000).unref();
}

// Scalp mode: the LLM strategist sets intraday plans; it reads Binance data, so stocks (FEED=alpaca) keep Jev-only mode.
if (config.strategy === "scalp" && config.strategist.apiKey && config.feed !== "alpaca") {
  agent.strategist = new Strategist(
    { ...config.strategist, feePctPerSide: config.feeBps / 100 },
    config.symbols, marketData(), () => agent.strategistContext(),
  );
} else if (config.strategy === "scalp" && config.strategist.apiKey) console.log("strategist: off (FEED=alpaca is for stocks; the strategist needs Binance crypto symbols)");
// Alpaca reports the real account, so use its starting equity as the baseline for PnL.
if (config.broker === "alpaca") (config as { startCash: number }).startCash = broker.equity({});

console.log(`jev-agent: strategy=${config.strategy} capital=$${config.capitalUsd} ai=${config.strategist.apiKey ? config.strategist.model : "off"} telegram=${notify.enabled ? "on" : "off"} strategist=${agent.strategist ? config.strategist.model : "off"} model=${config.model} feed=${config.feed} broker=${config.broker} symbols=${config.symbols} PAPER TRADING`);
await agent.start();
agent.strategist?.start();
void trend?.start();
startDashboard(agent, config.dashboard);

const report = setInterval(() => console.log(JSON.stringify(agent.summary())), 10_000);
const shutdown = (sig: string) => {
  console.log(`${sig}: stopping`, JSON.stringify(agent.summary()));
  clearInterval(report);
  agent.stop();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
// systemd restarts us; an unhandled error must not leave a half-alive process.
process.on("uncaughtException", (e) => { console.error("fatal", e); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error("fatal", e); process.exit(1); });
