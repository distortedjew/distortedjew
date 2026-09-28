import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { UsersTable } from "@/components/admin/users-table";

export const metadata: Metadata = { title: "Admin · Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      username: true,
      email: true,
      isGuest: true,
      role: true,
      status: true,
      trustScore: true,
      createdAt: true,
      _count: { select: { reportsReceived: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search and moderate accounts.</p>
      </div>
      <UsersTable
        initialQuery={q ?? ""}
        users={users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          isGuest: u.isGuest,
          role: u.role,
          status: u.status,
          trustScore: u.trustScore,
          createdAt: u.createdAt.toISOString(),
          reportsReceivedCount: u._count.reportsReceived,
        }))}
      />
    </div>
  );
}
