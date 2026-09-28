import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getStorageProvider, ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_BYTES } from "@/lib/storage";
import { rateLimit } from "@/lib/redis/rate-limit";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimit(`avatar-upload:${session.sub}`, 5, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("avatar");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 415 });
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "Image must be smaller than 4MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `avatars/${session.sub}-${nanoid(8)}.${EXTENSION_BY_MIME[file.type]}`;

  const storage = getStorageProvider();
  const { url } = await storage.upload({ key, buffer, contentType: file.type });

  await prisma.profile.update({
    where: { userId: session.sub },
    data: { avatarUrl: url },
  });

  return NextResponse.json({ avatarUrl: url });
}
