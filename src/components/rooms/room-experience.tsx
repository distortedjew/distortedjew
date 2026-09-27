"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSocket, useSocketMessage } from "@/hooks/socket-provider";
import { RoomChatPanel } from "./room-chat-panel";
import { ParticipantList } from "./participant-list";
import { RoomCallGrid } from "./room-call-grid";
import { GamePanel } from "@/components/chat/game-panel";
import { ReportDialog } from "@/components/chat/report-dialog";
import type { RoomChannel, RoomParticipantView } from "@/types/ws";

interface RoomInfo {
  id: string;
  title: string;
  topic: string | null;
  rules: string | null;
  channel: RoomChannel;
  maxParticipants: number;
  hostId: string;
}

export function RoomExperience({ room, selfId }: { room: RoomInfo; selfId: string }) {
  const router = useRouter();
  const { send, status } = useSocket();
  const [participants, setParticipants] = useState<RoomParticipantView[]>([]);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const peerHelpers = useRef<{
    connectToPeer: (id: string) => void;
    disconnectFromPeer: (id: string) => void;
  } | null>(null);
  const pendingLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (status !== "open") return;

    if (pendingLeaveTimer.current) {
      // React StrictMode's dev-only double effect invocation just tore this
      // effect down and is immediately setting it back up — we never
      // actually left, so cancel the deferred leave instead of re-joining.
      // A real "room:leave" broadcast tells every other participant in the
      // room to tear down their WebRTC connection to us, so unlike the 1:1
      // chat queue (nobody observes a transient dequeue/requeue), a
      // transient join→leave→join here is destructive, not just wasteful.
      clearTimeout(pendingLeaveTimer.current);
      pendingLeaveTimer.current = null;
    } else if (!joinedRef.current) {
      joinedRef.current = true;
      send({ type: "room:join", roomId: room.id });
    }

    return () => {
      pendingLeaveTimer.current = setTimeout(() => {
        pendingLeaveTimer.current = null;
        joinedRef.current = false;
        send({ type: "room:leave", roomId: room.id });
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useSocketMessage("room:joined", (msg) => {
    if (msg.roomId !== room.id) return;
    setParticipants(msg.participants);
    if (room.channel !== "TEXT") {
      for (const p of msg.participants) {
        if (p.userId !== selfId) peerHelpers.current?.connectToPeer(p.userId);
      }
    }
  });

  useSocketMessage("room:participant_joined", (msg) => {
    if (msg.roomId !== room.id) return;
    setParticipants((prev) => [...prev.filter((p) => p.userId !== msg.participant.userId), msg.participant]);
    toast.message(`${msg.participant.displayName} joined the room`);
  });

  useSocketMessage("room:participant_left", (msg) => {
    if (msg.roomId !== room.id) return;
    setParticipants((prev) => prev.filter((p) => p.userId !== msg.userId));
    peerHelpers.current?.disconnectFromPeer(msg.userId);
  });

  useSocketMessage("room:participants", (msg) => {
    if (msg.roomId !== room.id) return;
    setParticipants(msg.participants);
  });

  useSocketMessage("room:muted", (msg) => {
    if (msg.roomId !== room.id) return;
    setParticipants((prev) =>
      prev.map((p) => (p.userId === msg.targetUserId ? { ...p, mutedByHost: msg.muted } : p)),
    );
    if (msg.targetUserId === selfId) {
      toast.info(msg.muted ? "The host muted you." : "The host unmuted you.");
    }
  });

  useSocketMessage("room:removed", (msg) => {
    if (msg.roomId !== room.id) return;
    if (msg.targetUserId === selfId) {
      toast.error("You were removed from the room.");
      router.push("/rooms");
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.userId !== msg.targetUserId));
    peerHelpers.current?.disconnectFromPeer(msg.targetUserId);
  });

  useSocketMessage("error", (msg) => {
    toast.error(msg.message);
    if (msg.code === "ROOM_JOIN_FAILED") router.push("/rooms");
  });

  function leaveRoom() {
    send({ type: "room:leave", roomId: room.id });
    router.push("/rooms");
  }

  function mute(userId: string, muted: boolean) {
    send({ type: "room:mute", roomId: room.id, targetUserId: userId, muted });
  }

  function remove(userId: string) {
    send({ type: "room:remove", roomId: room.id, targetUserId: userId });
  }

  async function block(userId: string) {
    await fetch("/api/block", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    toast.success("User blocked.");
  }

  async function submitReport(category: string, description: string) {
    if (!reportTarget) return;
    await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportedId: reportTarget, category, description, roomId: room.id }),
    });
    toast.success("Report submitted.");
    setReportTarget(null);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-5xl flex-col md:flex-row">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-base font-semibold">{room.title}</h1>
              <Badge variant="secondary">{room.channel}</Badge>
            </div>
            {room.topic && <p className="text-xs text-muted-foreground">{room.topic}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={leaveRoom}>
            <LogOut className="size-4" />
            Leave
          </Button>
        </div>

        {room.channel !== "TEXT" && (
          <RoomCallGrid
            roomId={room.id}
            channel={room.channel}
            participants={participants}
            selfId={selfId}
            active
            onPeersReady={(helpers) => {
              peerHelpers.current = helpers;
            }}
          />
        )}

        <div className="flex-1 overflow-hidden">
          <RoomChatPanel roomId={room.id} selfId={selfId} onOpenGames={() => setGamesOpen(true)} />
        </div>
      </div>

      <div className="w-full border-t border-border/60 md:w-64 md:border-l md:border-t-0">
        <ParticipantList
          participants={participants}
          selfId={selfId}
          isSelfHost={participants.find((p) => p.userId === selfId)?.role === "HOST"}
          onMute={mute}
          onRemove={remove}
          onBlock={block}
          onReport={(userId) => setReportTarget(userId)}
        />
      </div>

      <GamePanel roomId={room.id} selfId={selfId} open={gamesOpen} onOpenChange={setGamesOpen} />

      <ReportDialog
        open={reportTarget !== null}
        onOpenChange={(open) => !open && setReportTarget(null)}
        onSubmit={submitReport}
      />
    </div>
  );
}
