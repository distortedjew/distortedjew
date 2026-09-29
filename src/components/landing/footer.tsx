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
      { href: "/safety", label: "Safety" },
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background px-5 sm:px-8">
      <div className="mx-auto max-w-6xl py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
              <Logo size="size-8" iconSize="size-5" />
              {APP_NAME}
            </Link>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Text, voice and video chat with people you haven&apos;t met yet,
              matched at random or by interest and language.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="mb-3 font-display text-sm font-semibold">{col.title}</h2>
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

        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <span>For adults 18+. Be kind, and report anyone who isn&apos;t.</span>
        </div>
      </div>
    </footer>
  );
}
