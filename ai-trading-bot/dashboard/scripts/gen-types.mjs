#!/usr/bin/env node
/**
 * Generate src/types/api.ts from the backend contract (backend/tradebot/schemas.py).
 *
 *   npm run gen:types
 *
 * Runs backend/scripts/export_schema.py with the backend virtualenv and compiles the
 * JSON Schema with json-schema-to-typescript (equivalent to the CLI flags
 * --unreachableDefinitions --additionalProperties false --ignoreMinAndMaxItems).
 * The output is committed; never edit it by hand.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const dashboardDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(dashboardDir, "../backend");
const outFile = resolve(dashboardDir, "src/types/api.ts");

const python = [process.env.TRADEBOT_PYTHON, resolve(backendDir, ".venv/bin/python"), "python3"].find(
  (candidate) => candidate && (candidate === "python3" || existsSync(candidate)),
);

let raw;
try {
  raw = execFileSync(python, [resolve(backendDir, "scripts/export_schema.py")], {
    cwd: backendDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  console.error(`gen:types: could not run export_schema.py with ${python}`);
  console.error("Create the backend virtualenv first (see ai-trading-bot/README.md) or set TRADEBOT_PYTHON.");
  throw error;
}

const schema = JSON.parse(raw);

const banner = `/* eslint-disable */
/**
 * GENERATED — do not edit; run npm run gen:types
 *
 * Source: backend/tradebot/schemas.py (via backend/scripts/export_schema.py).
 * Units: *_pct, confidence, win_rate, *_accuracy, utilization_pct and progress are percent
 * units (4.82 = 4.82 %); datetimes are UTC ISO 8601 strings; chart \`time\` fields are unix seconds.
 */`;

const ts = await compile(schema, "TradebotContract", {
  bannerComment: banner,
  unreachableDefinitions: true,
  additionalProperties: false,
  ignoreMinAndMaxItems: true,
  strictIndexSignatures: false,
  enableConstEnums: false,
  format: true,
  style: {
    bracketSpacing: true,
    printWidth: 110,
    semi: true,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "all",
    useTabs: false,
  },
});

writeFileSync(outFile, ts);
const count = (ts.match(/^export (interface|type) /gm) ?? []).length;
console.log(`gen:types: wrote ${count} declarations to ${outFile}`);
