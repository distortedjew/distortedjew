"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Users2, Gamepad2, Heart, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/rooms", label: "Rooms", icon: Users2 },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/friends", label: "Friends", icon: Heart },
  { href: "/profile", label: "Profile", icon: UserCircle },
];

export function MobileTabbar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden"
    >
      <div className="grid grid-cols-5 gap-1 px-2 py-1.5">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "bg-accent text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="size-5" />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
