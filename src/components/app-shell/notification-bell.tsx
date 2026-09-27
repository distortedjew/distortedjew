"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  Trophy,
  ShieldAlert,
  UserPlus,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSocketMessage } from "@/hooks/socket-provider";

interface NotificationItem {
  id: string;
  type:
    | "CONNECTION_REQUEST"
    | "CONNECTION_ACCEPTED"
    | "SYSTEM"
    | "MODERATION"
    | "ACHIEVEMENT";
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICONS: Record<
  NotificationItem["type"],
  React.ComponentType<{ className?: string }>
> = {
  ACHIEVEMENT: Trophy,
  MODERATION: ShieldAlert,
  CONNECTION_REQUEST: UserPlus,
  CONNECTION_ACCEPTED: UserPlus,
  SYSTEM: Info,
};

function timeAgo(iso: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .finally(() => setLoaded(true));
  }, []);

  useSocketMessage("notification", (msg) => {
    setNotifications((prev) => [
      {
        id: msg.notification.id,
        type: (msg.notification.type as NotificationItem["type"]) ?? "SYSTEM",
        title: msg.notification.title,
        body: msg.notification.body ?? null,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      ...prev.filter((n) => n.id !== msg.notification.id),
    ]);
    setUnreadCount((n) => n + 1);
  });

  async function markAllRead() {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => undefined);
  }

  async function markRead(id: string) {
    const notif = notifications.find((n) => n.id === id);
    if (!notif || notif.readAt) return;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    setUnreadCount((n) => Math.max(0, n - 1));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {!loaded ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            notifications.map((n) => {
              const Icon = ICONS[n.type] ?? Info;
              return (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-accent",
                    !n.readAt && "bg-primary/5",
                  )}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{n.title}</span>
                      {!n.readAt && (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {n.body}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
