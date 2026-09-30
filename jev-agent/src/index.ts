import { Agent } from "./agent.js";
import { AlpacaBroker, AlpacaFeed, binanceToAlpaca } from "./alpaca.js";
import { PaperBroker } from "./broker.js";
import { config } from "./config.js";
import { startDashboard } from "./dashboard.js";
import { BinanceFeed, SimFeed } from "./feeds.js";
import { createModel } from "./model.js";
import type { Broker, Feed } from "./types.js";

const die = (m: string) => { console.error(m); process.exit(1); };
if (config.model === "jev" && !process.env.TYPESAFE_AI_API_KEY) die("MODEL=jev needs TYPESAFE_AI_API_KEY");
const needsAlpaca = config.feed === "alpaca" || config.broker === "alpaca";
if (needsAlpaca && !(config.alpaca.keyId && config.alpaca.secret)) die("Alpaca needs ALPACA_KEY_ID and ALPACA_SECRET_KEY (paper keys)");
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
} else broker = new PaperBroker(config.startCash, config.feeBps, config.slippageBps);

const agent = new Agent(config, createModel(), broker, feed);
// Alpaca reports the real account, so use its starting equity as the baseline for PnL.
if (config.broker === "alpaca") (config as { startCash: number }).startCash = broker.equity({});

console.log(`jev-agent: model=${config.model} feed=${config.feed} broker=${config.broker} symbols=${config.symbols} PAPER TRADING`);
await agent.start();
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
