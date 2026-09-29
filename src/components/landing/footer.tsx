import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/discover", label: "Discover" },
      { href: "/rooms", label: "Group rooms" },
      { href: "/games", label: "Mini-games" },
      { href: "/friends", label: "Connections" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/safety", label: "Safety center" },
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold">
              <Logo size="size-8" iconSize="size-4" />
              {APP_NAME}
            </Link>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              A modern social discovery platform for meeting new people through
              text, voice, and video — matched by interests, language, and vibe.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="mb-3 text-sm font-medium text-foreground">{col.title}</div>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</span>
          <span>{APP_NAME} is for adults 18+. Be kind. Report anything that isn&apos;t.</span>
        </div>
      </div>
    </footer>
  );
}
