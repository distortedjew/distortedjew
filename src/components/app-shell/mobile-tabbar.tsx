"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Users2, Gamepad2, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/rooms", label: "Rooms", icon: Users2 },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/profile", label: "Profile", icon: UserCircle },
];

export function MobileTabbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden">
      <div className="flex items-center justify-around px-2 py-2">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-[11px] font-medium",
                active ? "text-primary-foreground dark:text-primary" : "text-muted-foreground",
              )}
            >
              <tab.icon className="size-5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
