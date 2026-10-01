import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

// Auth pages render their forms as Cards; here they drop the card chrome so
// they read as a page, matching the guest sign-in screen.
const FLATTEN_CARD = [
  "[&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent",
  "[&_[data-slot=card-header]]:px-0 [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-footer]]:px-0",
  "[&_[data-slot=card-header]]:pt-0",
  "[&_[data-slot=card-title]]:font-display [&_[data-slot=card-title]]:text-4xl [&_[data-slot=card-title]]:font-bold [&_[data-slot=card-title]]:tracking-tight",
  "[&_[data-slot=card-description]]:text-base",
].join(" ");

export const metadata: Metadata = { robots: NOINDEX };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col px-5 sm:px-8">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
          <Logo size="size-8" iconSize="size-5" />
          {APP_NAME}
        </Link>
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 outline-none ${FLATTEN_CARD}`}>
        {children}
      </main>
    </div>
  );
}
