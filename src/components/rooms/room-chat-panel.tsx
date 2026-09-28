"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSocket, useSocketMessage } from "@/hooks/socket-provider";
import { cn } from "@/lib/utils";
import type { ChatMessagePayload } from "@/types/ws";

interface LocalMessage extends ChatMessagePayload {
  self: boolean;
}

export function RoomChatPanel({
  roomId,
  selfId,
  onOpenGames,
}: {
  roomId: string;
  selfId: string;
  onOpenGames: () => void;
}) {
  const { send } = useSocket();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useSocketMessage("room:message", (msg) => {
    if (msg.roomId !== roomId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.message.id)) return prev;
      return [...prev, { ...msg.message, self: msg.message.senderId === selfId }];
    });
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function sendMessage() {
    const body = draft.trim();
    if (!body) return;
    send({ type: "room:message", roomId, body });
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="text-sm font-medium">Room chat</span>
        <Button variant="ghost" size="icon-sm" onClick={onOpenGames} title="Play a game">
          <Gamepad2 className="size-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col", m.self ? "items-end" : "items-start")}>
              {!m.self && <span className="mb-0.5 px-1 text-[11px] text-muted-foreground">{m.senderName}</span>}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                  m.self ? "bg-primary text-primary-foreground" : "border border-border/60 bg-card",
                )}
              >
                {m.body}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Say hello to the room 👋
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Message the room…"
          maxLength={2000}
          className="h-10 flex-1 rounded-full border border-input bg-input/30 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <Button size="icon-sm" onClick={sendMessage} disabled={!draft.trim()}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
