"use client";

import { useState } from "react";
import { Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export interface MusicShare {
  title: string;
  artist: string;
  url?: string;
}

export function MusicShareDialog({ onShare }: { onShare: (share: MusicShare) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");

  function submit() {
    if (!title.trim() || !artist.trim()) return;
    onShare({ title: title.trim(), artist: artist.trim(), url: url.trim() || undefined });
    setOpen(false);
    setTitle("");
    setArtist("");
    setUrl("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Share a song">
          <Music2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share what you&apos;re listening to</DialogTitle>
          <DialogDescription>
            Shares the song title, artist, and an optional link — not the audio itself.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="song-title">Song</Label>
            <Input id="song-title" className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="song-artist">Artist</Label>
            <Input id="song-artist" className="mt-1.5" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="song-url">Link (Spotify, Apple Music, YouTube…)</Label>
            <Input
              id="song-url"
              className="mt-1.5"
              placeholder="https://open.spotify.com/track/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={300}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={!title.trim() || !artist.trim()}>
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NowPlayingCard({ title, artist, url }: MusicShare) {
  const card = (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 text-primary">
        <Music2 className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{artist}</div>
      </div>
    </div>
  );

  if (!url) return card;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">
      {card}
    </a>
  );
}
