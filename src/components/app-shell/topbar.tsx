"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, LogOut, Settings, User as UserIcon, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

export interface AppUser {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  isGuest: boolean;
  role: "USER" | "MODERATOR" | "ADMIN";
}

const LINKS = [
  { href: "/discover", label: "Discover" },
  { href: "/rooms", label: "Rooms" },
  { href: "/games", label: "Games" },
  { href: "/friends", label: "Friends" },
];

export function Topbar({ user }: { user: AppUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const initial = (user.displayName || user.username).slice(0, 1).toUpperCase();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/discover" className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <span className="hidden sm:inline">{APP_NAME}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-1 pr-1 outline-none hover:bg-accent">
            <Avatar className="size-8">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.username} />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <Badge variant="muted" className="hidden sm:inline-flex">
              Lv {user.level}
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {user.displayName || user.username}
              {user.isGuest && <span className="ml-1.5 text-muted-foreground">(guest)</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserIcon /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings /> Settings
              </Link>
            </DropdownMenuItem>
            {(user.role === "ADMIN" || user.role === "MODERATOR") && (
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <ShieldCheck /> Admin
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={logout}>
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
