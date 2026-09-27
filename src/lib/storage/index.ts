import "server-only";
import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local-provider";
import { S3StorageProvider } from "./s3-provider";

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;

  const kind = process.env.STORAGE_PROVIDER;
  if (kind === "s3" && process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_BUCKET) {
    provider = new S3StorageProvider();
  } else {
    provider = new LocalStorageProvider();
  }
  return provider;
}

export * from "./types";
