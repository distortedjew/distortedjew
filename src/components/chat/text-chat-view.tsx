"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SkipForward, Heart, Shield, Smile, Send, Gamepad2, Ban, Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ReportDialog } from "./report-dialog";
import { MusicShareDialog, NowPlayingCard, type MusicShare } from "./music-share-dialog";
import { useSocket, useSocketMessage } from "@/hooks/socket-provider";
import { cn } from "@/lib/utils";
import type { ChatMessagePayload, PublicPeerInfo } from "@/types/ws";

const QUICK_REACTIONS = ["👍", "😂", "❤️", "😮", "😢", "🔥"];

interface LocalMessage extends ChatMessagePayload {
  self: boolean;
}

export function TextChatView({
  peer,
  matchId,
  icebreaker,
  connectState,
  onNext,
  onLeave,
  onReport,
  onBlock,
  onConnect,
  onOpenGames,
  selfId,
  preferredLanguage,
  autoTranslate,
}: {
  peer: PublicPeerInfo;
  matchId: string;
  icebreaker: string;
  connectState: "idle" | "pending" | "mutual";
  onNext: () => void;
  onLeave: () => void;
  onReport: (category: string, description: string) => void;
  onBlock: () => void;
  onConnect: () => void;
  onOpenGames: () => void;
  selfId: string;
  preferredLanguage: string;
  autoTranslate: boolean;
}) {
  const { send } = useSocket();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function translateMessage(message: LocalMessage) {
    if (message.translatedBody || translatingId) return;
    setTranslatingId(message.id);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: message.body, targetLanguage: preferredLanguage }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? { ...m, translatedBody: data.translatedText, translatedLang: preferredLanguage }
              : m,
          ),
        );
      }
    } finally {
      setTranslatingId(null);
    }
  }

  useSocketMessage("chat:message", (msg) => {
    if (msg.message.matchId !== matchId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.message.id)) return prev;
      return [...prev, { ...msg.message, self: msg.message.senderId === selfId }];
    });
    const isIncoming = msg.message.senderId !== selfId;
    if (isIncoming && autoTranslate && msg.message.kind === "TEXT") {
      translateMessage({ ...msg.message, self: false });
    }
  });

  useSocketMessage("chat:typing", (msg) => {
    if (msg.matchId !== matchId) return;
    setPeerTyping(msg.isTyping);
  });

  useSocketMessage("chat:reaction", (msg) => {
    if (msg.matchId !== matchId) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `reaction-${Date.now()}`,
        matchId,
        senderId: msg.peerId,
        senderName: peer.peerDisplayName,
        body: msg.emoji,
        kind: "REACTION",
        createdAt: new Date().toISOString(),
        self: false,
      },
    ]);
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, peerTyping]);

  function sendMessage() {
    const body = draft.trim();
    if (!body) return;
    send({ type: "chat:message", matchId, body });
    setDraft("");
    send({ type: "chat:typing", matchId, isTyping: false });
  }

  function onDraftChange(value: string) {
    setDraft(value);
    send({ type: "chat:typing", matchId, isTyping: value.length > 0 });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      send({ type: "chat:typing", matchId, isTyping: false });
    }, 2000);
  }

  function sendReaction(emoji: string) {
    send({ type: "chat:reaction", matchId, emoji });
    setMessages((prev) => [
      ...prev,
      {
        id: `reaction-${Date.now()}`,
        matchId,
        senderId: selfId,
        senderName: "You",
        body: emoji,
        kind: "REACTION",
        createdAt: new Date().toISOString(),
        self: true,
      },
    ]);
  }

  function shareMusic(share: MusicShare) {
    send({
      type: "chat:message",
      matchId,
      body: `🎵 ${share.title} — ${share.artist}`,
      kind: "MUSIC_SHARE",
      metadata: { ...share },
    });
  }

  const initial = peer.peerDisplayName.slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto flex h-app max-w-2xl flex-col px-4">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 py-2.5 sm:gap-3 sm:py-3">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Avatar className="shrink-0">
            <AvatarImage src={peer.peerAvatarUrl ?? undefined} />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{peer.peerDisplayName}</span>
              {peer.peerTrusted && <Badge variant="success">Trusted</Badge>}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {peer.peerCountry ?? "Location hidden"}
              {peer.peerIsGuest && ", guest"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <Button variant="ghost" size="icon-sm" onClick={onOpenGames} title="Play a game" aria-label="Play a game">
            <Gamepad2 className="size-4" />
          </Button>
          <MusicShareDialog onShare={shareMusic} />
          <Button
            variant={connectState === "mutual" ? "default" : "ghost"}
            size="icon-sm"
            onClick={onConnect}
            disabled={connectState === "mutual"}
            title={connectState === "mutual" ? "Connected" : "Connect"}
            aria-label={connectState === "mutual" ? "Connected" : "Connect"}
          >
            <Heart className={cn("size-4", connectState === "mutual" && "fill-current")} />
          </Button>
          <ReportDialog
            onSubmit={onReport}
            trigger={
              <Button variant="ghost" size="icon-sm" title="Report" aria-label="Report">
                <Shield className="size-4" />
              </Button>
            }
          />
          <Button variant="ghost" size="icon-sm" onClick={onBlock} title="Block" aria-label="Block">
            <Ban className="size-4" />
          </Button>
        </div>
      </div>

      {peer.sharedInterests.length > 0 && (
        <div className="border-b border-border/60 py-2 text-center text-xs text-muted-foreground">
          You both like {peer.sharedInterests.slice(0, 3).join(", ")}
        </div>
      )}

      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-4">
        {icebreaker && (
          <p className="mx-auto mb-5 max-w-[40ch] text-center text-sm leading-relaxed text-muted-foreground">
            Not sure how to start? Try: <span className="text-foreground">{icebreaker}</span>
          </p>
        )}

        <div className="flex flex-col gap-2">
          {messages.map((m) =>
            m.kind === "REACTION" ? (
              <div key={m.id} className={cn("text-2xl", m.self ? "self-end" : "self-start")}>
                {m.body}
              </div>
            ) : m.kind === "MUSIC_SHARE" ? (
              <div key={m.id} className={cn("max-w-[75%]", m.self ? "self-end" : "self-start")}>
                <NowPlayingCard
                  title={(m.metadata?.title as string) ?? m.body}
                  artist={(m.metadata?.artist as string) ?? ""}
                  url={m.metadata?.url as string | undefined}
                />
              </div>
            ) : (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[80%] px-4 py-2.5 text-[0.95rem] leading-snug",
                  m.self
                    ? "self-end rounded-[1.25rem] rounded-br-[0.375rem] bg-primary text-primary-foreground"
                    : "self-start rounded-[1.25rem] rounded-bl-[0.375rem] bg-glow/30 text-foreground dark:bg-glow/20",
                )}
              >
                {m.body}
                {m.translatedBody && (
                  <div className="mt-1 flex items-center gap-1 text-xs opacity-70">
                    <Languages className="size-3" />
                    {m.translatedBody}
                  </div>
                )}
                {!m.self && !m.translatedBody && (
                  <button
                    type="button"
                    onClick={() => translateMessage(m)}
                    disabled={translatingId === m.id}
                    className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {translatingId === m.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Languages className="size-3" />
                    )}
                    Translate
                  </button>
                )}
              </motion.div>
            ),
          )}
          {peerTyping && (
            <div className="self-start rounded-[1.25rem] rounded-bl-[0.375rem] bg-glow/30 px-4 py-3 text-foreground/70 dark:bg-glow/20" aria-label="Typing">
              <span className="inline-flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-border/60 py-1.5 sm:py-2">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`React with ${emoji}`}
            onClick={() => sendReaction(emoji)}
            className="rounded-full p-1.5 text-lg transition-transform hover:bg-accent active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 py-2 sm:py-3">
        <div className="relative flex-1">
          <input
            aria-label="Message"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && sendMessage()}
            placeholder="Type a message…"
            maxLength={2000}
            className="h-11 w-full rounded-full border border-input bg-card px-4 pr-10 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Smile aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button size="icon" onClick={sendMessage} disabled={!draft.trim()} aria-label="Send message">
          <Send className="size-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 py-2 sm:py-3">
        <Button variant="outline" size="sm" onClick={onLeave}>
          Leave
        </Button>
        <Button onClick={onNext}>
          <SkipForward className="size-4" />
          Next
        </Button>
      </div>
    </div>
  );
}
