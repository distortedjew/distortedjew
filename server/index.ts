import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { createGateway } from "./ws/gateway";
import { serveUpload } from "./uploads";
import { warmBlocklistCache } from "@/lib/matchmaking/blocklist";

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();
  await warmBlocklistCache().catch((err) => {
    console.error("[boot] failed to warm blocklist cache", err);
  });

  const server = createServer(async (req, res) => {
    if (await serveUpload(req, res)) return;
    handle(req, res);
  });

  const gateway = createGateway();
  const nextUpgradeHandler = app.getUpgradeHandler();
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/ws")) {
      gateway.handleUpgrade(req, socket, head);
    } else {
      // Let Next.js handle its own upgrade requests (HMR, etc).
      nextUpgradeHandler(req, socket, head);
    }
  });

  // Docker (and most process managers) stop containers with SIGTERM: stop
  // accepting connections and exit, so clients reconnect to the new instance
  // instead of hanging until the hard kill.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`> ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    server.closeAllConnections();
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  server.listen(port, () => {
    const appUrl = process.env.APP_URL || `http://localhost:${port}`;
    console.log(`> Wisp is running on ${appUrl} (${dev ? "development" : "production"})`);
    if (/\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(appUrl)) {
      console.log(
        "> Opening it from another machine (e.g. http://<server-ip>:" +
          port +
          ")? Set APP_URL to that address in .env and restart, or the page will load but nothing will be clickable.",
      );
    }
  });
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
