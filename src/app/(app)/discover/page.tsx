import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { GuestGate } from "@/components/discover/guest-gate";
import { DiscoverForm } from "@/components/discover/discover-form";

export const metadata: Metadata = { title: "Discover" };

export default async function DiscoverPage() {
  const session = await getCurrentUser();
  if (!session) return <GuestGate />;

  const profile = await prisma.profile.findUnique({
    where: { userId: session.sub },
    select: { interests: true, languages: true, country: true },
  });

  return (
    <DiscoverForm
      defaultInterests={profile?.interests ?? []}
      defaultLanguage={profile?.languages?.[0] ?? null}
      defaultCountry={profile?.country ?? null}
    />
  );
}
