"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PartnerLeftScreen({
  reason,
  onFindAnother,
}: {
  reason: "next" | "disconnect" | "reported" | null;
  onFindAnother: () => void;
}) {
  const message =
    reason === "next"
      ? "Your partner moved on to the next chat."
      : "Your partner left the conversation.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-app flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UserX className="size-6" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold">{message}</h1>
        <p className="mt-2 text-sm text-muted-foreground">No hard feelings — try another match.</p>
      </div>
      <div className="flex gap-3">
        <Button onClick={onFindAnother}>Find someone else</Button>
        <Button asChild variant="outline">
          <Link href="/discover">Back to home</Link>
        </Button>
      </div>
    </motion.div>
  );
}
