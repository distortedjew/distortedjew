"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  isGuest: boolean;
  role: "USER" | "MODERATOR" | "ADMIN";
  status: string;
  trustScore: number;
  createdAt: string;
  reportsReceivedCount: number;
}

const STATUS_VARIANT: Record<string, "success" | "destructive" | "muted" | "outline"> = {
  ACTIVE: "success",
  TIMEOUT: "outline",
  SUSPENDED: "destructive",
  BANNED: "destructive",
  DELETED: "muted",
};

export function UsersTable({ users, initialQuery }: { users: UserRow[]; initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState<UserRow | null>(null);
  const [type, setType] = useState("WARNING");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function search() {
    router.push(`/admin/users?q=${encodeURIComponent(query)}`);
  }

  async function moderate() {
    if (!active || !reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${active.id}/moderate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, reason, timeoutMinutes: type === "TIMEOUT" ? 15 : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not apply action.");
        return;
      }
      toast.success("Action applied.");
      setActive(null);
      setReason("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search by username or email…"
        />
        <Button onClick={search}>
          <Search className="size-4" />
        </Button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <strong>@{u.username}</strong>
                  {u.isGuest && <Badge variant="muted">Guest</Badge>}
                  {u.role !== "USER" && <Badge variant="outline">{u.role}</Badge>}
                  <Badge variant={STATUS_VARIANT[u.status] ?? "outline"}>{u.status}</Badge>
                </div>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {u.email ?? "no email"} · trust {u.trustScore} · {u.reportsReceivedCount} reports received ·
                  joined {new Date(u.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => setActive(u)}>
                Moderate
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Moderate @{active?.username}</DialogTitle>
            <DialogDescription>This action is logged and visible in the moderation log.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger aria-label="Moderation action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WARNING">Warn</SelectItem>
                <SelectItem value="TIMEOUT">Timeout (15 minutes)</SelectItem>
                <SelectItem value="SUSPENSION">Suspend</SelectItem>
                <SelectItem value="BAN">Ban (admin only)</SelectItem>
                <SelectItem value="UNBAN">Restore account (admin only)</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Reason (required, shown in the moderation log)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button onClick={moderate} disabled={submitting} variant="destructive">
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
