import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { SettingsForm } from "@/components/settings/settings-form";
import { LANGUAGE_OPTIONS } from "@/lib/validation/profile";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.sub },
      select: { username: true, email: true, isGuest: true, emailVerified: true },
    }),
    prisma.userSettings.findUnique({ where: { userId: session.sub } }),
  ]);

  if (!user || !settings) redirect("/discover");

  return (
    <SettingsForm
      account={{
        username: user.username,
        email: user.email,
        isGuest: user.isGuest,
        emailVerified: !!user.emailVerified,
      }}
      settings={{
        preferredLanguage: settings.preferredLanguage,
        soundEffectsEnabled: settings.soundEffectsEnabled,
        notifyOnConnection: settings.notifyOnConnection,
        notifyOnMessage: settings.notifyOnMessage,
        autoTranslate: settings.autoTranslate,
        safeModeStrict: settings.safeModeStrict,
        showCountry: settings.showCountry,
      }}
      languageOptions={LANGUAGE_OPTIONS}
    />
  );
}
