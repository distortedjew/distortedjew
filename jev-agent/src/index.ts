import { Agent } from "./agent.js";
import { PaperBroker } from "./broker.js";
import { config } from "./config.js";
import { BinanceFeed, SimFeed } from "./feeds.js";
import { createModel } from "./model.js";

if (config.model === "jev" && !process.env.TYPESAFE_AI_API_KEY) {
  console.error("MODEL=jev needs TYPESAFE_AI_API_KEY");
  process.exit(1);
}

const feed = config.feed === "binance" ? new BinanceFeed(config.symbols) : new SimFeed(config.symbols);
const broker = new PaperBroker(config.startCash, config.feeBps, config.slippageBps);
const agent = new Agent(config, createModel(), broker, feed);

console.log(`jev-agent: model=${config.model} feed=${config.feed} symbols=${config.symbols} PAPER TRADING`);
await agent.start();

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
