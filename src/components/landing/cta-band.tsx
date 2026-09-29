import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaBand() {
  return (
    <section className="px-6 pb-24">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/20 via-card to-secondary/10 px-8 py-16 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          One click. A completely new conversation.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          No profile required to start. Jump in as a guest, or create an account to
          keep your connections and progress.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="group">
            <Link href="/discover">
              Start Random Chat
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register">Create an account</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
