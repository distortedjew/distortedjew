"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "HARASSMENT", label: "Harassment" },
  { value: "SPAM", label: "Spam" },
  { value: "SEXUAL_CONTENT", label: "Sexual content" },
  { value: "HATE_ABUSE", label: "Hate / abusive content" },
  { value: "THREATS", label: "Threats" },
  { value: "SCAM", label: "Scam" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "OTHER", label: "Other" },
];

export function ReportDialog({
  onSubmit,
  trigger,
}: {
  onSubmit: (category: string, description: string) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  function submit() {
    if (!category) return;
    onSubmit(category, description);
    setOpen(false);
    setCategory(null);
    setDescription("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Flag className="size-4" />
            Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this person</DialogTitle>
          <DialogDescription>
            This ends the conversation immediately. Our safety team reviews every report.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                category === c.value
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border/60 hover:border-border",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <Textarea
          className="mt-4"
          placeholder="Add details (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />

        <DialogFooter>
          <Button variant="destructive" disabled={!category} onClick={submit}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
