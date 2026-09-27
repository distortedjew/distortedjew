"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SkipForward, Heart, Shield, Smile, Send, Gamepad2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ReportDialog } from "./report-dialog";
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
}) {
  const { send } = useSocket();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [peerTyping, setPeerTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSocketMessage("chat:message", (msg) => {
    if (msg.message.matchId !== matchId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.message.id)) return prev;
      return [...prev, { ...msg.message, self: msg.message.senderId === selfId }];
    });
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

  const initial = peer.peerDisplayName.slice(0, 1).toUpperCase();

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col px-4">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 py-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={peer.peerAvatarUrl ?? undefined} />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              {peer.peerDisplayName}
              {peer.peerTrusted && <Badge variant="success">Trusted</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {peer.peerCountry ? peer.peerCountry : "Location hidden"} ·{" "}
              {peer.peerIsGuest ? "Guest" : "Member"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon-sm" onClick={onOpenGames} title="Play a game">
            <Gamepad2 className="size-4" />
          </Button>
          <Button
            variant={connectState === "mutual" ? "default" : "ghost"}
            size="icon-sm"
            onClick={onConnect}
            disabled={connectState === "mutual"}
            title="Connect"
          >
            <Heart className={cn("size-4", connectState === "mutual" && "fill-current")} />
          </Button>
          <ReportDialog
            onSubmit={onReport}
            trigger={
              <Button variant="ghost" size="icon-sm" title="Report">
                <Shield className="size-4" />
              </Button>
            }
          />
          <Button variant="ghost" size="icon-sm" onClick={onBlock} title="Block">
            <Ban className="size-4" />
          </Button>
        </div>
      </div>

      {peer.sharedInterests.length > 0 && (
        <div className="border-b border-border/60 py-2 text-center text-xs text-muted-foreground">
          You both like {peer.sharedInterests.slice(0, 3).join(", ")}
          {peer.sharedInterests.length <= 3 ? " 🎉" : ""}
        </div>
      )}

      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto py-4">
        <div className="mb-4 rounded-2xl border border-border/60 bg-card/60 p-4 text-center text-sm text-muted-foreground">
          💬 {icebreaker}
        </div>

        <div className="flex flex-col gap-2">
          {messages.map((m) =>
            m.kind === "REACTION" ? (
              <div key={m.id} className={cn("text-2xl", m.self ? "self-end" : "self-start")}>
                {m.body}
              </div>
            ) : (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                  m.self
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start bg-card border border-border/60",
                )}
              >
                {m.body}
                {m.translatedBody && (
                  <div className={cn("mt-1 text-xs opacity-70")}>{m.translatedBody}</div>
                )}
              </motion.div>
            ),
          )}
          {peerTyping && (
            <div className="self-start rounded-2xl border border-border/60 bg-card px-4 py-2.5 text-sm text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-border/60 py-2">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="rounded-full p-1.5 text-lg hover:bg-accent"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 py-3">
        <div className="relative flex-1">
          <input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message…"
            maxLength={2000}
            className="h-11 w-full rounded-full border border-input bg-input/30 px-4 pr-10 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <Smile className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button size="icon" onClick={sendMessage} disabled={!draft.trim()}>
          <Send className="size-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 py-3">
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
