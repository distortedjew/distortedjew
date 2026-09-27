import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { createGateway } from "./ws/gateway";
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

  const server = createServer((req, res) => {
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

  server.listen(port, () => {
    console.log(`> Wisp is running on http://localhost:${port} (${dev ? "development" : "production"})`);
  });
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
