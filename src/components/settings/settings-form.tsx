"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  account: { username: string; email: string | null; isGuest: boolean };
  settings: SettingsState;
  languageOptions: readonly { code: string; label: string }[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      toast.error("Network error.");
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
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {saving ? "Saving…" : "Changes save automatically."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>@{account.username}{account.isGuest && " · Guest session"}</CardDescription>
        </CardHeader>
        <CardContent>
          {account.email ? (
            <p className="text-sm text-muted-foreground">{account.email}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {account.isGuest ? "Guest accounts don't have an email on file." : "No email on file."}
            </p>
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
            <SelectTrigger className="max-w-xs">
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
                <div>
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                </div>
                <Switch
                  checked={settings[t.key] as boolean}
                  onCheckedChange={(checked) => persist({ [t.key]: checked })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Deleting your account removes your profile and personal data.</CardDescription>
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
                  This removes your profile, avatar, and personal details immediately. It
                  can&apos;t be undone. Some conversation records may be retained in
                  anonymized form for safety purposes, per our Privacy Policy.
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
