import type { Metadata } from "next";
import { prisma } from "@/lib/db/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Admin · Moderation log" };

const TYPE_VARIANT: Record<string, "outline" | "destructive" | "muted" | "success"> = {
  WARNING: "outline",
  TIMEOUT: "outline",
  SUSPENSION: "destructive",
  BAN: "destructive",
  UNBAN: "success",
  NOTE: "muted",
};

export default async function AdminModerationPage() {
  const actions = await prisma.moderationAction.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      target: { select: { username: true } },
      issuer: { select: { username: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Moderation log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every account-level action taken, automated or manual — nothing changes a
          user&apos;s status without a row here.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {actions.length === 0 && <p className="text-sm text-muted-foreground">No actions yet.</p>}
        {actions.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-col gap-1 py-4">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={TYPE_VARIANT[a.type] ?? "outline"}>{a.type}</Badge>
                <strong>@{a.target.username}</strong>
                <span className="text-xs text-muted-foreground">
                  {a.automated ? "automated" : a.issuer ? `by @${a.issuer.username}` : "system"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{a.reason}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(a.createdAt).toLocaleString()}
                {a.expiresAt && ` · expires ${new Date(a.expiresAt).toLocaleString()}`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
