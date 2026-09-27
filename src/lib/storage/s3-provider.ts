import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageProvider, UploadResult } from "./types";

/** Real S3-compatible storage (AWS S3, Cloudflare R2, MinIO, Backblaze B2, etc). */
export class S3StorageProvider implements StorageProvider {
  name = "s3";
  private client: S3Client;
  private bucket: string;
  private publicUrlBase: string;

  constructor() {
    const endpoint = process.env.STORAGE_ENDPOINT;
    const region = process.env.STORAGE_REGION || "auto";
    const accessKeyId = process.env.STORAGE_ACCESS_KEY!;
    const secretAccessKey = process.env.STORAGE_SECRET_KEY!;
    this.bucket = process.env.STORAGE_BUCKET!;
    this.publicUrlBase = process.env.STORAGE_PUBLIC_URL || `${endpoint}/${this.bucket}`;

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  async upload({ key, buffer, contentType }: { key: string; buffer: Buffer; contentType: string }): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { url: `${this.publicUrlBase.replace(/\/$/, "")}/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
