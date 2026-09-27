import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      username: true,
      isGuest: true,
      role: true,
      status: true,
      xp: true,
      level: true,
      streakDays: true,
      trustScore: true,
      createdAt: true,
      profile: {
        select: {
          displayName: true,
          avatarUrl: true,
          bio: true,
          interests: true,
          languages: true,
          country: true,
          visibility: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user });
}
