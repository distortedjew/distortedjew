import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let root: string;
let serveUpload: typeof import("./uploads").serveUpload;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "wisp-serve-"));
  await mkdir(path.join(root, "public", "uploads", "avatars"), { recursive: true });
  await writeFile(path.join(root, "public", "uploads", "avatars", "a.png"), "png-bytes");
  await writeFile(path.join(root, "public", "uploads", "notes.txt"), "secret");
  await writeFile(path.join(root, "package.json"), "{}");
  vi.spyOn(process, "cwd").mockReturnValue(root);
  ({ serveUpload } = await import("./uploads"));
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

function fakeRes() {
  const body = new PassThrough();
  const chunks: Buffer[] = [];
  body.on("data", (c) => chunks.push(Buffer.from(c)));
  const res = Object.assign(body, {
    status: 0,
    headers: {} as Record<string, unknown>,
    writeHead(status: number, headers: Record<string, unknown>) {
      res.status = status;
      res.headers = headers;
      return res;
    },
    text: () => new Promise<string>((resolve) => body.on("finish", () => resolve(Buffer.concat(chunks).toString()))),
  });
  return res;
}

async function request(url: string, method = "GET") {
  const res = fakeRes();
  const done = res.text();
  const handled = await serveUpload({ url, method } as IncomingMessage, res as unknown as ServerResponse);
  return { handled, status: res.status, headers: res.headers, body: handled ? await done : "" };
}

describe("serveUpload", () => {
  it("ignores non-upload paths so Next.js handles them", async () => {
    expect((await request("/discover")).handled).toBe(false);
  });

  it("serves an uploaded image with safe headers", async () => {
    const r = await request("/uploads/avatars/a.png");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("image/png");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.body).toBe("png-bytes");
  });

  it("404s missing files and non-image types", async () => {
    expect((await request("/uploads/avatars/missing.png")).status).toBe(404);
    expect((await request("/uploads/notes.txt")).status).toBe(404);
  });

  it("blocks path traversal out of the uploads folder", async () => {
    expect((await request("/uploads/../../package.json")).status).toBe(404);
    expect((await request("/uploads/%2e%2e/%2e%2e/package.json")).status).toBe(404);
  });
});
