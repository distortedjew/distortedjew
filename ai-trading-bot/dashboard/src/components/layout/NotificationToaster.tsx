import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useWsFrame } from "@/hooks/live";
import { cn } from "@/lib/cn";
import { NOTIFICATION_TYPE_META, TOASTED_NOTIFICATION_TYPES } from "@/lib/constants";
import { secondsSince } from "@/lib/time";
import { TONE_TEXT } from "@/lib/tones";

/** Toasts trade events and warnings/errors as they stream in (one per notification id). */
export function NotificationToaster() {
  const navigate = useNavigate();

  useWsFrame("notification", (n) => {
    if (n.read || !TOASTED_NOTIFICATION_TYPES.has(n.type)) return;
    const age = secondsSince(n.ts);
    if (age !== null && age > 120) return; // replayed / old: the bell already shows it
    const meta = NOTIFICATION_TYPE_META[n.type];
    const tone = n.severity === "error" ? "down" : n.severity === "warning" ? "warning" : meta.tone;
    const Icon = meta.icon;
    toast(n.title, {
      id: `notification-${n.id}`,
      description: n.message,
      icon: <Icon className={cn("size-4", TONE_TEXT[tone])} aria-hidden />,
      duration: n.severity === "error" ? 12_000 : n.severity === "warning" ? 8_000 : 5_000,
      action: { label: "View", onClick: () => navigate(meta.route) },
    });
  });

  return null;
}
