import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col px-5 sm:px-8">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
          <Logo size="size-8" iconSize="size-5" />
          {APP_NAME}
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
        <h1 className="type-poster text-5xl sm:text-6xl">This page doesn&apos;t exist</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          The link may be old or mistyped. You can start a chat from the home page.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/">Go to the home page</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
