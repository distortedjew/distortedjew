import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getTranslationProvider } from "@/lib/translation";
import { rateLimit } from "@/lib/redis/rate-limit";

const translateSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  targetLanguage: z.string().min(2).max(8),
  sourceLanguage: z.string().min(2).max(8).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimit(`translate:${session.sub}`, 30, 60);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many translation requests." }, { status: 429 });
  }

  const parsed = translateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const result = await getTranslationProvider().translate(
      parsed.data.text,
      parsed.data.targetLanguage,
      parsed.data.sourceLanguage,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[translate] provider error", err);
    return NextResponse.json({ error: "Translation is temporarily unavailable." }, { status: 502 });
  }
}
