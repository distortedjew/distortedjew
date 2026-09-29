import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

// Same directory LocalStorageProvider writes to. Next.js only serves files
// that were in public/ at build time, so anything uploaded while the app is
// running (avatars) has to be served here instead.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Serves /uploads/* from disk. Returns false if the request isn't for an upload. */
export async function serveUpload(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url?.startsWith("/uploads/")) return false;
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  let relative: string;
  try {
    relative = decodeURIComponent(req.url.slice("/uploads/".length).split("?")[0]);
  } catch {
    return notFound(res);
  }
  const filePath = path.resolve(UPLOAD_DIR, relative);
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
  if (!filePath.startsWith(UPLOAD_DIR + path.sep) || !contentType) return notFound(res);

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return notFound(res);

  res.writeHead(200, {
    "content-type": contentType,
    "content-length": info.size,
    // Keys are unique per upload, so the content at a URL never changes.
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(filePath)
    .on("error", () => res.destroy())
    .pipe(res);
  return true;
}

function notFound(res: ServerResponse): true {
  res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  return true;
}
