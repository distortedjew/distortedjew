import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ChatExperience } from "@/components/chat/chat-experience";
import type { MatchChannel, MatchMode } from "@/types/ws";

export const metadata: Metadata = { title: "Chat" };

const VALID_MODES: MatchMode[] = [
  "RANDOM", "INTERESTS", "SAME_LANGUAGE", "LANGUAGE_EXCHANGE",
  "SAME_COUNTRY", "WORLDWIDE", "GAMING", "MUSIC", "JUST_TALKING",
];
const VALID_CHANNELS: MatchChannel[] = ["TEXT", "VOICE", "VIDEO"];

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentUser();
  if (!session) redirect("/discover");

  const params = await searchParams;
  const get = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const mode = VALID_MODES.includes(get("mode") as MatchMode) ? (get("mode") as MatchMode) : "RANDOM";
  const channel = VALID_CHANNELS.includes(get("channel") as MatchChannel)
    ? (get("channel") as MatchChannel)
    : "TEXT";
  const interests = get("interests")?.split(",").filter(Boolean) ?? [];
  const language = get("language") || null;
  const country = get("country") || null;

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.sub },
    select: { preferredLanguage: true, autoTranslate: true },
  });

  return (
    <ChatExperience
      filters={{ mode, channel, interests, language, country }}
      selfId={session.sub}
      preferredLanguage={settings?.preferredLanguage ?? "en"}
      autoTranslate={settings?.autoTranslate ?? false}
    />
  );
}
