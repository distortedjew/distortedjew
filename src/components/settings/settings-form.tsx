"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, BadgeCheck, MailWarning, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RETENTION } from "@/lib/retention-policy";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SettingsState {
  preferredLanguage: string;
  soundEffectsEnabled: boolean;
  notifyOnConnection: boolean;
  notifyOnMessage: boolean;
  autoTranslate: boolean;
  safeModeStrict: boolean;
  showCountry: boolean;
}

export function SettingsForm({
  account,
  settings: initialSettings,
  languageOptions,
}: {
  account: { username: string; email: string | null; isGuest: boolean; emailVerified: boolean };
  settings: SettingsState;
  languageOptions: readonly { code: string; label: string }[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);
  const [justResent, setJustResent] = useState(false);

  async function resendVerification() {
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not send verification email.");
        return;
      }
      setJustResent(true);
      toast.success("Verification email sent. Check your inbox.");
    } finally {
      setResending(false);
    }
  }

  async function persist(patch: Partial<SettingsState>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) toast.error("Could not save setting.");
    } catch {
      toast.error("Couldn't reach Wisp. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete account.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const toggles: Array<{ key: keyof SettingsState; label: string; description: string }> = [
    { key: "soundEffectsEnabled", label: "Sound effects", description: "Play subtle sounds for matches and messages." },
    { key: "notifyOnConnection", label: "Connection notifications", description: "Notify me when someone accepts a connection." },
    { key: "notifyOnMessage", label: "Message notifications", description: "Notify me about new messages." },
    { key: "autoTranslate", label: "Auto-translate", description: "Automatically translate messages in a different language." },
    { key: "safeModeStrict", label: "Strict safe mode", description: "Apply stricter automated content filtering." },
    { key: "showCountry", label: "Show my country", description: "Let matches see your country during chat." },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="type-poster text-5xl sm:text-6xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {saving ? "Saving…" : "Changes save automatically."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>@{account.username}{account.isGuest && ", guest account"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {account.email ? (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{account.email}</p>
              {account.emailVerified ? (
                <span className="flex items-center gap-1 text-xs font-medium text-success-foreground dark:text-success">
                  <BadgeCheck className="size-3.5" />
                  Verified
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <MailWarning className="size-3.5" />
                  Not verified
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {account.isGuest ? "Guest accounts don't have an email on file." : "No email on file."}
            </p>
          )}
          {account.email && !account.emailVerified && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={resendVerification}
              disabled={resending || justResent}
            >
              {resending && <Loader2 className="size-3.5 animate-spin" />}
              {justResent ? "Verification email sent" : "Resend verification email"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
          <CardDescription>Used for translation and default matching.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={settings.preferredLanguage}
            onValueChange={(v) => persist({ preferredLanguage: v })}
          >
            <SelectTrigger className="max-w-xs" aria-label="Preferred language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageOptions.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {toggles.map((t, i) => (
            <div key={t.key}>
              {i > 0 && <Separator className="mb-4" />}
              <div className="flex items-center justify-between gap-4">
                <label htmlFor={`setting-${t.key}`} className="cursor-pointer">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div id={`setting-${t.key}-desc`} className="text-xs text-muted-foreground">
                    {t.description}
                  </div>
                </label>
                <Switch
                  id={`setting-${t.key}`}
                  aria-describedby={`setting-${t.key}-desc`}
                  checked={settings[t.key] as boolean}
                  onCheckedChange={(checked) => persist({ [t.key]: checked })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Your data</CardTitle>
          <CardDescription>
            Download a copy of everything Wisp holds about your account: profile, settings, messages
            you&apos;ve sent, connections, reports you filed and login history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/api/account/export" download>
              <Download className="size-4" />
              Download my data
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle as="h2" className="text-destructive">Delete account</CardTitle>
          <CardDescription>Permanently remove your account. You can download your data first.</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="size-4" />
                Delete account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  Your username, email, password, profile, avatar, friends and notifications
                  are deleted now. Messages you sent are deleted within {RETENTION.messagesDays}{" "}
                  days ({RETENTION.flaggedDays} if they were reported), and are no longer linked
                  to you in the meantime. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="destructive" onClick={deleteAccount} disabled={deleting}>
                  {deleting && <Loader2 className="size-4 animate-spin" />}
                  Yes, delete my account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
