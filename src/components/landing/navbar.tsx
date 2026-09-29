"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

const LINKS = [
  { href: "/rooms", label: "Rooms" },
  { href: "/games", label: "Games" },
  { href: "/safety", label: "Safety" },
];

export function Navbar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
          <Logo size="size-8" iconSize="size-5" />
          {APP_NAME}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <Button asChild size="sm">
              <Link href="/discover">Open Wisp</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/discover">Start chatting</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="-mr-2 rounded-full p-2 hover:bg-accent md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-border/70 pb-5 pt-2 md:hidden">
          <nav aria-label="Main" className="flex flex-col">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-border/70 py-3.5 font-display text-lg font-semibold"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 flex gap-2">
            {isAuthenticated ? (
              <Button asChild className="flex-1">
                <Link href="/discover">Open Wisp</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link href="/discover">Start chatting</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
