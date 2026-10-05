import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Dev / preview server
 * - PORT (or DASHBOARD_PORT): port to listen on, default 5173.
 * - VITE_API_PROXY: where `/api` and `/ws` are proxied, default http://127.0.0.1:8000 (the FastAPI gateway).
 * In production the API serves dashboard/dist itself, so the app always talks to its own origin.
 */
const apiTarget = process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000";
const port = Number(process.env.PORT ?? process.env.DASHBOARD_PORT ?? 5173);

const proxy = {
  "/api": { target: apiTarget, changeOrigin: true },
  "/ws": { target: apiTarget, ws: true, changeOrigin: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: { port, strictPort: true, proxy },
  preview: { port, strictPort: true, proxy },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
  },
});
