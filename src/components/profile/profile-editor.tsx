"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, Save, Flame, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INTEREST_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/validation/profile";
import { COUNTRIES } from "@/lib/countries";
import { AchievementGrid, type AchievementView } from "./achievement-grid";

interface ProfileEditorProps {
  user: {
    username: string;
    isGuest: boolean;
    xp: number;
    level: number;
    streakDays: number;
    createdAt: string;
    connectionsCount: number;
    progressToNextLevel: number;
    nextLevelXp: number;
  };
  profile: {
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    interests: string[];
    languages: string[];
    country: string | null;
    visibility: "PUBLIC" | "CONNECTIONS_ONLY" | "PRIVATE";
  };
  achievements: AchievementView[];
}

export function ProfileEditor({ user, profile, achievements }: ProfileEditorProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [languages, setLanguages] = useState<string[]>(profile.languages);
  const [country, setCountry] = useState(profile.country ?? "");
  const [visibility, setVisibility] = useState(profile.visibility);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("avatar", file);
    try {
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed.");
        return;
      }
      setAvatarUrl(data.avatarUrl);
      toast.success("Avatar updated.");
    } catch {
      toast.error("Network error.");
    } finally {
      setUploading(false);
    }
  }

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest].slice(-12),
    );
  }

  function toggleLanguage(code: string) {
    setLanguages((prev) => (prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code].slice(-6)));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName || undefined,
          bio,
          interests,
          languages,
          country: country || null,
          visibility,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not save profile.");
        return;
      }
      toast.success("Profile saved.");
      router.refresh();
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  const initial = (displayName || user.username).slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-6 sm:flex-row sm:items-start">
          <div className="relative">
            <Avatar className="size-24">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:brightness-110"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onAvatarChange} />
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <h1 className="font-display text-xl font-semibold">{displayName || user.username}</h1>
              {user.isGuest && <Badge variant="muted">Guest</Badge>}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">@{user.username}</div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground sm:justify-start">
              <span className="flex items-center gap-1">
                <Users className="size-3.5" /> {user.connectionsCount} connections
              </span>
              <span className="flex items-center gap-1">
                <Flame className="size-3.5" /> {user.streakDays} day streak
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" /> Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              </span>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Level {user.level}</span>
                <span>{user.xp} / {user.nextLevelXp} XP</span>
              </div>
              <Progress value={user.progressToNextLevel} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-display-name">Display name</Label>
            <Input
              id="profile-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder={user.username}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              placeholder="A little about you…"
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Interests ({interests.length}/12)</legend>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={interests.includes(interest)}
                  onClick={() => toggleInterest(interest)}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Badge variant={interests.includes(interest) ? "default" : "outline"} className="cursor-pointer px-3 py-1.5">
                    {interest}
                  </Badge>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Languages ({languages.length}/6)</legend>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={languages.includes(l.code)}
                  onClick={() => toggleLanguage(l.code)}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Badge variant={languages.includes(l.code) ? "default" : "outline"} className="cursor-pointer px-3 py-1.5">
                    {l.label}
                  </Badge>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-country">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="profile-country">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-visibility">Profile visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
                <SelectTrigger id="profile-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                  <SelectItem value="CONNECTIONS_ONLY">Connections only</SelectItem>
                  <SelectItem value="PRIVATE">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="self-start">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save profile
          </Button>
        </CardContent>
      </Card>

      <AchievementGrid achievements={achievements} />
    </div>
  );
}
