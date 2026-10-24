import { createServer } from "node:http";
import { closeSync, openSync, readFileSync, readSync, statSync, existsSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildState, parseLog } from "./stats.ts";

const HOST = process.env.DASHBOARD_HOST ?? "127.0.0.1";
const PORT = Number(process.env.DASHBOARD_PORT ?? 8787);
const TOKEN = process.env.DASHBOARD_TOKEN ?? "";
const LOG = process.env.TRADES_LOG ?? "logs/trades.jsonl";
const MAX_BYTES = 8 * 1024 * 1024;
const html = readFileSync(fileURLToPath(new URL("../public/index.html", import.meta.url)));

if (HOST !== "127.0.0.1" && HOST !== "localhost" && !TOKEN) {
  console.error("Refusing to bind a non-local address without DASHBOARD_TOKEN.");
  process.exit(1);
}

/** Read only the tail of the log so a long-running bot never makes requests slow. */
function readTail(path: string): string {
  if (!existsSync(path)) return "";
  const size = statSync(path).size;
  const start = Math.max(0, size - MAX_BYTES);
  const buf = Buffer.alloc(size - start);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, buf.length, start);
  } finally {
    closeSync(fd);
  }
  const text = buf.toString("utf8");
  return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
}

function authorized(url: URL, header: string | undefined): boolean {
  if (!TOKEN) return true;
  const given = url.searchParams.get("token") ?? header?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:",
  };
  if (url.pathname === "/healthz") {
    res.writeHead(200, headers).end("ok");
  } else if (!authorized(url, req.headers.authorization)) {
    res.writeHead(401, headers).end("unauthorized");
  } else if (url.pathname === "/api/state") {
    const state = buildState(parseLog(readTail(LOG)), Date.now());
    res.writeHead(200, { ...headers, "content-type": "application/json" }).end(JSON.stringify(state));
  } else if (url.pathname === "/") {
    res.writeHead(200, { ...headers, "content-type": "text/html; charset=utf-8" }).end(html);
  } else {
    res.writeHead(404, headers).end("not found");
  }
}).listen(PORT, HOST, () => console.log(`Dashboard on http://${HOST}:${PORT} (log: ${LOG})`));
