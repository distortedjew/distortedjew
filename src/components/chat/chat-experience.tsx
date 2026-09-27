"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSocket, useSocketMessage } from "@/hooks/socket-provider";
import { SearchingScreen } from "./searching-screen";
import { PartnerLeftScreen } from "./partner-left-screen";
import { TextChatView } from "./text-chat-view";
import { CallView } from "./call-view";
import { GamePanel } from "./game-panel";
import type { MatchFilters, PublicPeerInfo } from "@/types/ws";

type Phase = "searching" | "active" | "ended";

export function ChatExperience({ filters, selfId }: { filters: MatchFilters; selfId: string }) {
  const router = useRouter();
  const { send, status } = useSocket();
  const [phase, setPhase] = useState<Phase>("searching");
  const [peer, setPeer] = useState<PublicPeerInfo | null>(null);
  const [icebreaker, setIcebreaker] = useState("");
  const [endReason, setEndReason] = useState<"next" | "disconnect" | "reported" | null>(null);
  const [connectState, setConnectState] = useState<"idle" | "pending" | "mutual">("idle");
  const [gamesOpen, setGamesOpen] = useState(false);

  const sendJoin = useCallback(() => {
    send({ type: "queue:join", filters });
  }, [send, filters]);

  const joinQueue = useCallback(() => {
    setPhase("searching");
    setPeer(null);
    setConnectState("idle");
    sendJoin();
  }, [sendJoin]);

  useEffect(() => {
    if (status !== "open") return;
    // Initial join: state is already at its "searching" defaults, so this
    // effect only needs to send the WS message, not reset local state.
    sendJoin();
    return () => {
      send({ type: "queue:leave" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useSocketMessage("queue:matched", (msg) => {
    setPeer(msg.peer);
    setIcebreaker(msg.icebreaker);
    setPhase("active");
  });

  useSocketMessage("chat:partner_left", (msg) => {
    setEndReason(msg.reason);
    setPhase("ended");
  });

  useSocketMessage("chat:connect_pending", () => {
    setConnectState("pending");
    toast.info("Connection request sent.");
  });

  useSocketMessage("chat:connect_mutual", (msg) => {
    setConnectState("mutual");
    toast.success(`You and ${msg.peerUsername} are now connected!`);
  });

  useSocketMessage("error", (msg) => {
    toast.error(msg.message);
  });

  function handleNext() {
    if (!peer) return;
    send({ type: "chat:next", matchId: peer.matchId });
    joinQueue();
  }

  function handleLeave() {
    if (peer) send({ type: "chat:leave", matchId: peer.matchId });
    router.push("/discover");
  }

  function handleReport(category: string, description: string) {
    if (!peer) return;
    send({ type: "chat:report", matchId: peer.matchId, category, description });
    setEndReason("reported");
    setPhase("ended");
    toast.success("Report submitted. Thank you for keeping Wisp safe.");
  }

  function handleBlock() {
    if (!peer) return;
    send({ type: "chat:block", matchId: peer.matchId });
    setEndReason("disconnect");
    setPhase("ended");
    toast.success("Blocked. You won't be matched with them again.");
  }

  function handleConnect() {
    if (!peer) return;
    send({ type: "chat:connect_request", matchId: peer.matchId });
  }

  if (phase === "searching" || !peer) {
    return (
      <SearchingScreen
        channel={filters.channel}
        mode={filters.mode}
        onCancel={() => {
          send({ type: "queue:leave" });
          router.push("/discover");
        }}
      />
    );
  }

  if (phase === "ended") {
    return <PartnerLeftScreen reason={endReason} onFindAnother={joinQueue} />;
  }

  return (
    <>
      {filters.channel === "TEXT" ? (
        <TextChatView
          peer={peer}
          matchId={peer.matchId}
          icebreaker={icebreaker}
          connectState={connectState}
          onNext={handleNext}
          onLeave={handleLeave}
          onReport={handleReport}
          onBlock={handleBlock}
          onConnect={handleConnect}
          onOpenGames={() => setGamesOpen(true)}
          selfId={selfId}
        />
      ) : (
        <CallView
          peer={peer}
          matchId={peer.matchId}
          connectState={connectState}
          onNext={handleNext}
          onLeave={handleLeave}
          onReport={handleReport}
          onBlock={handleBlock}
          onConnect={handleConnect}
        />
      )}
      <GamePanel matchId={peer.matchId} selfId={selfId} open={gamesOpen} onOpenChange={setGamesOpen} />
    </>
  );
}
