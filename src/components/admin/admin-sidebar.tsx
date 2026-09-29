"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Flag, Users, Radio, ShieldAlert, BarChart3, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

const LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/sessions", label: "Sessions", icon: Radio },
  { href: "/admin/moderation", label: "Moderation log", icon: ShieldAlert },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export function AdminSidebar({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-30 flex shrink-0 flex-col gap-3 border-b border-border/60 bg-background/90 p-3 backdrop-blur-xl md:h-screen md:w-60 md:gap-0 md:border-b-0 md:border-r md:bg-card/40 md:p-4">
      <div className="flex items-center justify-between md:mb-6">
        <div>
          <div className="font-display text-sm font-semibold">{APP_NAME} Admin</div>
          <div className="text-xs text-muted-foreground">{role}</div>
        </div>
        <Link
          href="/discover"
          className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        >
          <ArrowLeft className="size-3.5" />
          Back to app
        </Link>
      </div>

      <nav
        aria-label="Admin"
        className="scrollbar-thin -mx-3 flex gap-1 overflow-x-auto px-3 pb-0.5 md:mx-0 md:flex-1 md:flex-col md:overflow-visible md:px-0 md:pb-0"
      >
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors md:gap-2.5",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <link.icon className="size-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/discover"
        className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground md:flex"
      >
        <ArrowLeft className="size-4" />
        Back to app
      </Link>
    </aside>
  );
}
