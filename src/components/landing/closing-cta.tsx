import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section className="border-t border-border px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="type-poster max-w-[14ch] text-5xl sm:text-6xl">Someone new is one tap away.</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/discover">Start chatting</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register">Create an account</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
