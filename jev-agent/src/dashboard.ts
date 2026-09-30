import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { Agent } from "./agent.js";

const html = () => readFileSync(new URL("../public/index.html", import.meta.url));

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Read-only dashboard: one page, one JSON endpoint, one SSE stream. No control endpoints, so it cannot place or cancel trades. */
export function startDashboard(agent: Agent, opts: { port: number; host: string; token: string }) {
  const clients = new Set<import("node:http").ServerResponse>();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (opts.token && !same(url.searchParams.get("token") ?? "", opts.token)) {
      res.writeHead(401, { "content-type": "text/plain" }).end("unauthorized: open /?token=YOUR_DASHBOARD_TOKEN");
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }).end(html());
    } else if (url.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(agent.snapshot()));
    } else if (url.pathname === "/api/stream") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(`data: ${JSON.stringify(agent.snapshot())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
    } else res.writeHead(404).end();
  });
  setInterval(() => {
    if (!clients.size) return;
    const msg = `data: ${JSON.stringify(agent.snapshot())}\n\n`;
    for (const c of clients) c.write(msg);
  }, 1000).unref();
  server.listen(opts.port, opts.host, () => console.log(`dashboard: http://${opts.host}:${opts.port}${opts.token ? "/?token=…" : ""}`));
  return server;
}
