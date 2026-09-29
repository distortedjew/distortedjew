"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Users2, MessageCircle, Mic, Video, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { INTEREST_OPTIONS } from "@/lib/validation/profile";

export interface RoomSummary {
  id: string;
  title: string;
  topic: string | null;
  interests: string[];
  channel: "TEXT" | "VOICE" | "VIDEO";
  maxParticipants: number;
  participantCount: number;
  hostName: string;
}

const CHANNEL_ICON = { TEXT: MessageCircle, VOICE: Mic, VIDEO: Video };

export function RoomsBrowser({ rooms }: { rooms: RoomSummary[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    topic: "",
    channel: "TEXT" as "TEXT" | "VOICE" | "VIDEO",
    interests: [] as string[],
    maxParticipants: 8,
  });

  function toggleInterest(interest: string) {
    setForm((f) => ({
      ...f,
      interests: f.interests.includes(interest)
        ? f.interests.filter((i) => i !== interest)
        : [...f.interests, interest].slice(-6),
    }));
  }

  async function createRoom() {
    if (!form.title.trim()) {
      toast.error("Give your room a title.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not create room.");
        return;
      }
      router.push(`/rooms/${data.room.id}`);
    } catch {
      toast.error("Network error.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-semibold">Group rooms</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join a temporary group conversation, or start your own.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Create room
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a room</DialogTitle>
              <DialogDescription>2–8 people, temporary, closes when everyone leaves.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div>
                <Label htmlFor="room-title">Title</Label>
                <Input
                  id="room-title"
                  className="mt-1.5"
                  placeholder="Late Night Gaming 🎮"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  maxLength={60}
                />
              </div>
              <div>
                <Label htmlFor="room-topic">Topic (optional)</Label>
                <Textarea
                  id="room-topic"
                  className="mt-1.5"
                  placeholder="What's this room about?"
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                  maxLength={120}
                />
              </div>
              <div>
                <Label htmlFor="room-channel">Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as typeof form.channel })}>
                  <SelectTrigger id="room-channel" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXT">Text</SelectItem>
                    <SelectItem value="VOICE">Voice</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <fieldset>
                <legend className="text-sm font-medium">Interests</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.slice(0, 12).map((interest) => (
                    <button
                      key={interest}
                      type="button"
                      aria-pressed={form.interests.includes(interest)}
                      onClick={() => toggleInterest(interest)}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Badge variant={form.interests.includes(interest) ? "default" : "outline"} className="cursor-pointer px-2.5 py-1">
                        {interest}
                      </Badge>
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <DialogFooter>
              <Button onClick={createRoom} disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Create & join
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {rooms.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Users2 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No rooms open right now. Start one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {rooms.map((room) => {
            const Icon = CHANNEL_ICON[room.channel];
            const full = room.participantCount >= room.maxParticipants;
            return (
              <Card key={room.id}>
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-primary" />
                      <h3 className="font-display text-base font-semibold">{room.title}</h3>
                    </div>
                    <Badge variant={full ? "muted" : "success"}>
                      {room.participantCount}/{room.maxParticipants}
                    </Badge>
                  </div>
                  {room.topic && <p className="text-sm text-muted-foreground">{room.topic}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {room.interests.slice(0, 4).map((i) => (
                      <Badge key={i} variant="outline">{i}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">Hosted by {room.hostName}</span>
                    <Button size="sm" disabled={full} onClick={() => router.push(`/rooms/${room.id}`)}>
                      Join
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
