"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2, MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export interface FlaggedRow {
  id: string;
  body: string;
  createdAt: string;
  senderUsername: string;
  riskScore: number | null;
  where: "chat" | "room";
}

export function FlaggedList({ messages: initial }: { messages: FlaggedRow[] }) {
  const [messages, setMessages] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);

  async function markReviewed(id: string) {
    setPending(id);
    try {
      const res = await fetch(`/api/admin/flagged/${id}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Could not mark as reviewed.");
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } finally {
      setPending(null);
    }
  }

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={MessageSquareWarning} message="Nothing waiting for review." />
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m) => (
        <li key={m.id}>
          <Card>
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Link
                    href={`/admin/users?q=${encodeURIComponent(m.senderUsername)}`}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    @{m.senderUsername}
                  </Link>
                  <Badge variant="muted">{m.where}</Badge>
                  {m.riskScore !== null && (
                    <Badge variant="outline">risk {Math.round(m.riskScore * 100)}%</Badge>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 self-start"
                disabled={pending === m.id}
                onClick={() => markReviewed(m.id)}
              >
                {pending === m.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Mark reviewed
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
