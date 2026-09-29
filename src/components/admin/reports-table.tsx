"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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

export interface ReportRow {
  id: string;
  category: string;
  status: "PENDING" | "REVIEWING" | "ACTIONED" | "DISMISSED";
  description: string | null;
  createdAt: string;
  reporterUsername: string;
  reportedUsername: string;
  reportedUserId: string;
  reportedTrustScore: number;
  reportedStatus: string;
  aiRiskScore: number | null;
}

const STATUS_VARIANT: Record<ReportRow["status"], "muted" | "destructive" | "success" | "outline"> = {
  PENDING: "destructive",
  REVIEWING: "outline",
  ACTIONED: "success",
  DISMISSED: "muted",
};

export function ReportsTable({ reports: initial }: { reports: ReportRow[] }) {
  const router = useRouter();
  const [reports, setReports] = useState(initial);
  const [active, setActive] = useState<ReportRow | null>(null);
  const [action, setAction] = useState("WARNING");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function resolve() {
    if (!active) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/reports/${active.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason || undefined,
          timeoutMinutes: action === "TIMEOUT" ? 15 : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Could not resolve report.");
        return;
      }
      setReports((prev) =>
        prev.map((r) =>
          r.id === active.id
            ? { ...r, status: action === "DISMISS" ? "DISMISSED" : "ACTIONED" }
            : r,
        ),
      );
      toast.success("Report resolved.");
      setActive(null);
      setReason("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {reports.length === 0 && (
          <Card>
            <CardContent>
              <EmptyState icon={Flag} message="No reports yet." />
            </CardContent>
          </Card>
        )}
        {reports.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <strong>@{r.reportedUsername}</strong>
                  <span className="text-muted-foreground">reported by @{r.reporterUsername}</span>
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  <Badge variant="outline">{r.category}</Badge>
                  {r.reportedStatus !== "ACTIVE" && (
                    <Badge variant="destructive">{r.reportedStatus}</Badge>
                  )}
                </div>
                {r.description && (
                  <p className="mt-1 max-w-xl break-words text-sm text-muted-foreground">{r.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()} · trust score {r.reportedTrustScore}
                  {r.aiRiskScore != null && ` · AI risk ${(r.aiRiskScore * 100).toFixed(0)}%`}
                </p>
              </div>
              {r.status === "PENDING" || r.status === "REVIEWING" ? (
                <Button size="sm" className="shrink-0" onClick={() => setActive(r)}>
                  Review
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Resolved</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve report</DialogTitle>
            <DialogDescription>
              Against @{active?.reportedUsername} for {active?.category.toLowerCase()}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger aria-label="Resolution">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DISMISS">Dismiss (no violation found)</SelectItem>
                <SelectItem value="WARNING">Warn the user</SelectItem>
                <SelectItem value="TIMEOUT">Timeout (15 minutes)</SelectItem>
                <SelectItem value="SUSPENSION">Suspend account</SelectItem>
                <SelectItem value="BAN">Ban account (admin only)</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Internal note / reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button onClick={resolve} disabled={submitting} variant={action === "DISMISS" ? "outline" : "destructive"}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
