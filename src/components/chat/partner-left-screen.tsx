"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export type EndReason = "next" | "disconnect" | "reported" | "blocked";

const COPY: Record<EndReason, { title: string; body: string }> = {
  next: { title: "They moved on", body: "It happens. The next person is one tap away." },
  disconnect: { title: "They left the chat", body: "Find someone else, or go back to change who you're matched with." },
  reported: { title: "Report sent", body: "Moderators will review it. The chat has ended for both of you." },
  blocked: { title: "Blocked", body: "You won't be matched with them again." },
};

export function PartnerLeftScreen({
  reason,
  onFindAnother,
}: {
  reason: EndReason | null;
  onFindAnother: () => void;
}) {
  const copy = COPY[reason ?? "disconnect"];

  return (
    <div className="flex min-h-app flex-col items-center justify-center gap-8 px-5 text-center">
      <span className="size-5 rounded-full bg-primary" aria-hidden />
      <div role="status">
        <h1 className="font-display text-3xl font-bold tracking-tight">{copy.title}</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-muted-foreground">{copy.body}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={onFindAnother}>Find someone else</Button>
        <Button asChild variant="outline">
          <Link href="/discover">Change filters</Link>
        </Button>
      </div>
    </div>
  );
}
