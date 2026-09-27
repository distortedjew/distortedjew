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
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border/60 bg-card/40 p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="font-display text-sm font-semibold">{APP_NAME} Admin</div>
          <div className="text-xs text-muted-foreground">{role}</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to app
      </Link>
    </aside>
  );
}
