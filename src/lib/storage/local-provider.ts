import "server-only";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider, UploadResult } from "./types";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Dev/local fallback storage: writes to /public/uploads and serves via
 * Next's static file handling. Used automatically when STORAGE_PROVIDER is
 * unset or "mock" so the app works end-to-end without real S3 credentials.
 */
export class LocalStorageProvider implements StorageProvider {
  name = "local";

  async upload({ key, buffer }: { key: string; buffer: Buffer; contentType: string }): Promise<UploadResult> {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, key);
    await writeFile(filePath, buffer);
    return { url: `/uploads/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(UPLOAD_DIR, key);
    await unlink(filePath).catch(() => undefined);
  }
}
