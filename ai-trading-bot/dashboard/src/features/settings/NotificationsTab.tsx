import { BellRing, CircleCheck, CircleSlash, Mail, MessageCircle, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { NOTIFICATION_TYPE_META } from "@/lib/constants";
import { TONE_TEXT } from "@/lib/tones";
import type { NotificationSettings, NotificationType } from "@/types";
import { Badge, Button, Checkbox, Field, Input, Switch } from "@/components/ui";
import { ModifiedMark, SettingsSection, type TabProps } from "@/features/settings/fields";

interface Channel {
  key: "telegram" | "discord" | "email";
  label: string;
  icon: LucideIcon;
  enabled: keyof NotificationSettings & `${string}_enabled`;
  configured: keyof NotificationSettings & `${string}_configured`;
  env: string[];
  description: string;
}

const CHANNELS: Channel[] = [
  {
    key: "telegram",
    label: "Telegram",
    icon: Send,
    enabled: "telegram_enabled",
    configured: "telegram_configured",
    env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    description: "Messages from your bot to a chat or channel.",
  },
  {
    key: "discord",
    label: "Discord",
    icon: MessageCircle,
    enabled: "discord_enabled",
    configured: "discord_configured",
    env: ["DISCORD_WEBHOOK_URL"],
    description: "Posts to a channel through an incoming webhook.",
  },
  {
    key: "email",
    label: "Email",
    icon: Mail,
    enabled: "email_enabled",
    configured: "email_configured",
    env: ["SMTP_HOST", "SMTP_FROM"],
    description: "Plain-text alerts through your SMTP server.",
  },
];

const EVENT_TYPES = Object.keys(NOTIFICATION_TYPE_META) as NotificationType[];

export function NotificationsTab({ form, errors, dirty, update }: TabProps) {
  const n = form.notifications;
  const toggleEvent = (type: NotificationType, on: boolean) => {
    const next = on ? [...n.events, type] : n.events.filter((t) => t !== type);
    update(
      "notifications",
      "events",
      EVENT_TYPES.filter((t) => next.includes(t)),
    );
  };
  const anyEnabled = n.telegram_enabled || n.discord_enabled || n.email_enabled;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface-2/50 px-4 py-3 text-dense text-fg-muted">
        All channels are optional. Bot tokens, webhook URLs and SMTP passwords are read from the server's
        environment only — they are never entered, stored or shown here. Notifications always appear in the
        dashboard's notification center.
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {CHANNELS.map((channel) => {
          const Icon = channel.icon;
          const enabled = n[channel.enabled] as boolean;
          const configured = n[channel.configured] as boolean;
          return (
            <SettingsSection
              key={channel.key}
              title={channel.label}
              icon={Icon}
              description={channel.description}
              actions={
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => update("notifications", channel.enabled, v)}
                  aria-label={`Send ${channel.label} notifications`}
                />
              }
            >
              <div className="space-y-3">
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium",
                    configured ? TONE_TEXT.up : "text-fg-subtle",
                  )}
                >
                  {configured ? (
                    <CircleCheck className="size-3.5" aria-hidden />
                  ) : (
                    <CircleSlash className="size-3.5" aria-hidden />
                  )}
                  {configured ? "Configured on server ✓" : "Not configured on server ✗"}
                  <ModifiedMark show={dirty.has(`notifications.${channel.enabled}`)} />
                </p>
                {!configured ? (
                  <p className="text-xs leading-[1.125rem] text-fg-subtle">
                    Set{" "}
                    {channel.env.map((name, i) => (
                      <span key={name}>
                        {i > 0 ? " and " : ""}
                        <span className="num text-fg-muted">{name}</span>
                      </span>
                    ))}{" "}
                    in the server environment and restart the engine to deliver {channel.label} alerts.
                    {enabled ? (
                      <span className="text-warning"> Enabled, but nothing is sent until then.</span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-xs text-fg-subtle">
                    {enabled
                      ? "Alerts for the selected events are delivered."
                      : "Turn on to deliver alerts for the selected events."}
                  </p>
                )}
                {channel.key === "email" ? (
                  <Field
                    label="Recipient"
                    htmlFor="setting-email-to"
                    error={errors["notifications.email_to"]}
                    aside={<ModifiedMark show={dirty.has("notifications.email_to")} />}
                  >
                    <Input
                      id="setting-email-to"
                      type="email"
                      size="sm"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={n.email_to ?? ""}
                      invalid={Boolean(errors["notifications.email_to"])}
                      onChange={(e) => update("notifications", "email_to", e.target.value || null)}
                    />
                  </Field>
                ) : null}
              </div>
            </SettingsSection>
          );
        })}
      </div>

      <SettingsSection
        title="Events to send"
        icon={BellRing}
        description={
          anyEnabled
            ? `${n.events.length} of ${EVENT_TYPES.length} event types`
            : "Used once a channel is enabled"
        }
        actions={
          <>
            <ModifiedMark show={dirty.has("notifications.events")} />
            <Button
              size="xs"
              variant="ghost"
              onClick={() => update("notifications", "events", [...EVENT_TYPES])}
            >
              All
            </Button>
            <Button size="xs" variant="ghost" onClick={() => update("notifications", "events", [])}>
              None
            </Button>
          </>
        }
      >
        <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
          {EVENT_TYPES.map((type) => {
            const meta = NOTIFICATION_TYPE_META[type];
            const Icon = meta.icon;
            const id = `notify-${type}`;
            const checked = n.events.includes(type);
            return (
              <label
                key={type}
                htmlFor={id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-dense text-fg-muted hover:bg-fg/[0.035]"
              >
                <Checkbox id={id} checked={checked} onCheckedChange={(v) => toggleEvent(type, v === true)} />
                <Icon className={cn("size-3.5", TONE_TEXT[meta.tone])} aria-hidden />
                <span className={checked ? "text-fg" : undefined}>{meta.label}</span>
                {type === "DAILY_LOSS_LIMIT" || type === "BOT_ERROR" ? (
                  <Badge tone="muted" size="xs" className="ml-auto">
                    Critical
                  </Badge>
                ) : null}
              </label>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}
