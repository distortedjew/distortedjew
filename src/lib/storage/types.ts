export interface UploadResult {
  url: string;
  key: string;
}

export interface StorageProvider {
  name: string;
  upload(params: { key: string; buffer: Buffer; contentType: string }): Promise<UploadResult>;
  delete(key: string): Promise<void>;
}

export const ALLOWED_AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4MB
