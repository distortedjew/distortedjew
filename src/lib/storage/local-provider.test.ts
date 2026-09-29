import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let root: string;
let LocalStorageProvider: typeof import("./local-provider").LocalStorageProvider;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "wisp-uploads-"));
  // UPLOAD_DIR is resolved from process.cwd() when the module loads.
  vi.spyOn(process, "cwd").mockReturnValue(root);
  ({ LocalStorageProvider } = await import("./local-provider"));
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("LocalStorageProvider", () => {
  it("creates missing sub-folders in the key on a fresh install", async () => {
    const provider = new LocalStorageProvider();
    const result = await provider.upload({
      key: "avatars/user-abc.png",
      buffer: Buffer.from("png-bytes"),
      contentType: "image/png",
    });

    expect(result.url).toBe("/uploads/avatars/user-abc.png");
    const written = await readFile(path.join(root, "public", "uploads", "avatars", "user-abc.png"), "utf8");
    expect(written).toBe("png-bytes");
  });
});
