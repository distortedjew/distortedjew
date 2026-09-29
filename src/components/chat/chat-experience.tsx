"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSocket, useSocketMessage } from "@/hooks/socket-provider";
import { SearchingScreen } from "./searching-screen";
import { PartnerLeftScreen, type EndReason } from "./partner-left-screen";
import { TextChatView } from "./text-chat-view";
import { CallView } from "./call-view";
import { GamePanel } from "./game-panel";
import type { MatchFilters, PublicPeerInfo } from "@/types/ws";

type Phase = "searching" | "active" | "ended";

export function ChatExperience({
  filters,
  selfId,
  preferredLanguage,
  autoTranslate,
}: {
  filters: MatchFilters;
  selfId: string;
  preferredLanguage: string;
  autoTranslate: boolean;
}) {
  const router = useRouter();
  const { send, status } = useSocket();
  const [phase, setPhase] = useState<Phase>("searching");
  const [peer, setPeer] = useState<PublicPeerInfo | null>(null);
  const [icebreaker, setIcebreaker] = useState("");
  const [endReason, setEndReason] = useState<EndReason | null>(null);
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

  const pendingLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "open") return;

    if (pendingLeaveTimer.current) {
      // React StrictMode's dev-only double effect invocation just tore this
      // down and is immediately setting it back up — cancel the deferred
      // leave instead of re-joining. Otherwise a transient join→leave→join
      // could pair a match during the first join and then abandon it
      // without properly ending it when the second join fires.
      clearTimeout(pendingLeaveTimer.current);
      pendingLeaveTimer.current = null;
    } else {
      // Initial join: state is already at its "searching" defaults, so this
      // only needs to send the WS message, not reset local state.
      sendJoin();
    }

    return () => {
      pendingLeaveTimer.current = setTimeout(() => {
        pendingLeaveTimer.current = null;
        send({ type: "queue:leave" });
      }, 0);
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
    toast.success("Report sent.");
  }

  function handleBlock() {
    if (!peer) return;
    send({ type: "chat:block", matchId: peer.matchId });
    setEndReason("blocked");
    setPhase("ended");
    toast.success("Blocked.");
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
          preferredLanguage={preferredLanguage}
          autoTranslate={autoTranslate}
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
