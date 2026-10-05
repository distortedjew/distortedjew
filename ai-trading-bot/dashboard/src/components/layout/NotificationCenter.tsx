import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, ChevronRight, Inbox } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMarkNotificationsRead, useNotifications } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { NOTIFICATION_TYPE_META } from "@/lib/constants";
import { formatDayLabel, formatRelativeTime } from "@/lib/format";
import { motionPresets } from "@/lib/motion";
import { useNow } from "@/lib/time";
import { TONE_CHIP } from "@/lib/tones";
import type { Notification } from "@/types";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { IconButton } from "@/components/ui/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";

const LIST_PARAMS = { limit: 50 } as const;

/** Unread count on the bell (99+ cap). */
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className="num absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-down-solid px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-canvas"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NotificationRow({
  notification,
  now,
  onOpen,
  onMarkRead,
}: {
  notification: Notification;
  now: number;
  onOpen: (n: Notification) => void;
  onMarkRead: (n: Notification) => void;
}) {
  const meta = NOTIFICATION_TYPE_META[notification.type];
  const tone = notification.severity === "error" ? "down" : notification.severity === "warning" ? "warning" : meta.tone;
  const Icon = meta.icon;
  return (
    <motion.li layout="position" {...motionPresets.listItem} className="group/item relative">
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-fg/[0.05] focus-visible:bg-fg/[0.05] focus-visible:outline-none",
          !notification.read && "bg-accent/[0.035]",
        )}
      >
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", TONE_CHIP[tone])}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={cn("truncate text-dense", notification.read ? "text-fg-muted" : "font-medium text-fg")}>
              {notification.title}
            </span>
            <span className="num shrink-0 text-[10.5px] text-fg-subtle">{formatRelativeTime(notification.ts, now)}</span>
          </span>
          <span className="mt-0.5 line-clamp-2 text-xs leading-[1.45] text-fg-subtle">{notification.message}</span>
        </span>
      </button>
      {!notification.read ? (
        <Tooltip content="Mark as read" side="left">
          <button
            type="button"
            aria-label="Mark as read"
            onClick={() => onMarkRead(notification)}
            className="absolute top-3 right-1.5 hidden size-5 items-center justify-center rounded-full text-fg-subtle group-hover/item:flex hover:bg-fg/10 hover:text-fg focus-visible:flex"
          >
            <CheckCheck className="size-3" aria-hidden />
          </button>
        </Tooltip>
      ) : null}
      {!notification.read ? (
        <span aria-label="Unread" className="absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full bg-accent group-hover/item:opacity-0" />
      ) : null}
    </motion.li>
  );
}

/** Bell with unread count; popover list grouped by day; mark one / all read. */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const query = useNotifications(LIST_PARAMS);
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const now = useNow();

  const unread = query.data?.unread_count ?? 0;
  const items = query.data?.items;

  const groups: { label: string; items: Notification[] }[] = [];
  for (const n of items ?? []) {
    if (filter === "unread" && n.read) continue;
    const label = formatDayLabel(n.ts, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }

  const onOpen = (n: Notification) => {
    if (!n.read) markRead.mutate([n.id]);
    setOpen(false);
    navigate(NOTIFICATION_TYPE_META[n.type].route);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton
          icon={Bell}
          label={unread ? `Notifications (${unread} unread)` : "Notifications"}
          tooltip="Notifications"
          badge={<UnreadBadge count={unread} />}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(400px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-dense font-semibold text-fg">Notifications</h2>
            {unread ? (
              <span className="num rounded-full bg-accent/15 px-1.5 text-[11px] font-medium text-accent">{unread} new</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <SegmentedControl
              aria-label="Filter notifications"
              size="xs"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread" },
              ]}
            />
            <IconButton
              icon={CheckCheck}
              label="Mark all as read"
              size="xs"
              disabled={!unread || markRead.isPending}
              onClick={() => markRead.mutate([])}
            />
          </div>
        </div>

        <div className="max-h-[min(480px,65dvh)] overflow-y-auto overscroll-contain px-1.5 py-1.5">
          {query.isPending ? (
            <div className="space-y-3 p-2.5" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-7 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-2.5 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : query.error && !items ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} compact className="m-2" />
          ) : groups.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Inbox}
              title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
              description="Trades, stop-loss / take-profit hits, risk warnings and system problems show up here."
            />
          ) : (
            groups.map((group) => (
              <section key={group.label} className="mb-1">
                <h3 className="label-caps px-2.5 pt-2 pb-1">{group.label}</h3>
                <ul>
                  <AnimatePresence initial={false}>
                    {group.items.map((n) => (
                      <NotificationRow
                        key={n.id}
                        notification={n}
                        now={now}
                        onOpen={onOpen}
                        onMarkRead={(x) => markRead.mutate([x.id])}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3.5 py-2">
          <span className="text-[11px] text-fg-subtle">
            {query.data ? `${query.data.total} total` : null}
          </span>
          <Button asChild variant="link" size="xs" className="text-xs">
            <Link to="/system" onClick={() => setOpen(false)}>
              Event log <ChevronRight className="size-3" aria-hidden />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
