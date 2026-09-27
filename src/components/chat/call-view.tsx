"use client";

import { useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  SkipForward,
  Heart,
  Shield,
  Ban,
  Maximize,
  Loader2,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ReportDialog } from "./report-dialog";
import { useWebRtc } from "@/hooks/use-webrtc";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { cn } from "@/lib/utils";
import type { PublicPeerInfo } from "@/types/ws";

function ConnectionBadge({ state }: { state: string }) {
  if (state === "connected") return <Badge variant="success">Connected</Badge>;
  if (state === "reconnecting")
    return (
      <Badge variant="destructive">
        <WifiOff className="size-3" /> Reconnecting…
      </Badge>
    );
  if (state === "failed") return <Badge variant="destructive">Connection failed</Badge>;
  return (
    <Badge variant="muted">
      <Loader2 className="size-3 animate-spin" /> Connecting…
    </Badge>
  );
}

export function CallView({
  peer,
  matchId,
  connectState,
  onNext,
  onLeave,
  onReport,
  onBlock,
  onConnect,
}: {
  peer: PublicPeerInfo;
  matchId: string;
  connectState: "idle" | "pending" | "mutual";
  onNext: () => void;
  onLeave: () => void;
  onReport: (category: string, description: string) => void;
  onBlock: () => void;
  onConnect: () => void;
}) {
  const {
    state,
    localStream,
    remoteStream,
    cameraOn,
    micOn,
    peerMediaState,
    toggleCamera,
    toggleMic,
  } = useWebRtc({
    matchId,
    channel: peer.channel,
    isInitiator: peer.isInitiator,
    iceServers: peer.iceServers,
    active: true,
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const remoteLevel = useAudioLevel(remoteStream);
  const initial = peer.peerDisplayName.slice(0, 1).toUpperCase();
  const isVideo = peer.channel === "VIDEO";

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      if (localStream) localVideoRef.current.play().catch(() => undefined);
    }
  }, [localStream]);

  useEffect(() => {
    if (isVideo && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      if (remoteStream) remoteVideoRef.current.play().catch(() => undefined);
    }
    if (!isVideo && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      if (remoteStream) remoteAudioRef.current.play().catch(() => undefined);
    }
  }, [remoteStream, isVideo]);

  function goFullscreen() {
    stageRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-3xl flex-col px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{peer.peerDisplayName}</span>
          {peer.peerTrusted && <Badge variant="success">Trusted</Badge>}
        </div>
        <ConnectionBadge state={state} />
      </div>

      <div
        ref={stageRef}
        className="relative flex-1 overflow-hidden rounded-3xl border border-border/60 bg-black"
      >
        {isVideo ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={cn("h-full w-full object-cover", !peerMediaState.camera && "opacity-0")}
            />
            {!peerMediaState.camera && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-background to-muted">
                <Avatar className="size-20">
                  <AvatarImage src={peer.peerAvatarUrl ?? undefined} />
                  <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">Camera off</span>
              </div>
            )}

            <div className="absolute bottom-4 right-4 aspect-video w-32 overflow-hidden rounded-xl border border-white/20 shadow-lg sm:w-44">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={cn("h-full w-full object-cover -scale-x-100", !cameraOn && "opacity-0")}
              />
              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
                  You
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <audio ref={remoteAudioRef} autoPlay />
            <div className="relative flex items-center justify-center">
              <span
                className="absolute rounded-full bg-primary/20 transition-transform duration-100"
                style={{
                  width: 140 + remoteLevel * 60,
                  height: 140 + remoteLevel * 60,
                }}
              />
              <Avatar className="size-28 border-4 border-background">
                <AvatarImage src={peer.peerAvatarUrl ?? undefined} />
                <AvatarFallback className="text-3xl">{initial}</AvatarFallback>
              </Avatar>
            </div>
            <div className="text-center">
              <div className="font-display text-lg font-medium text-white">{peer.peerDisplayName}</div>
              <div className="text-xs text-white/60">
                {peerMediaState.mic ? "Speaking" : "Muted"}
              </div>
            </div>
          </div>
        )}

        {isVideo && (
          <button
            onClick={goFullscreen}
            className="absolute left-4 top-4 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
          >
            <Maximize className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant={micOn ? "secondary" : "destructive"}
            size="icon"
            onClick={toggleMic}
            title={micOn ? "Mute" : "Unmute"}
          >
            {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </Button>
          {isVideo && (
            <Button
              variant={cameraOn ? "secondary" : "destructive"}
              size="icon"
              onClick={toggleCamera}
              title={cameraOn ? "Turn camera off" : "Turn camera on"}
            >
              {cameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
            </Button>
          )}
          <Button
            variant={connectState === "mutual" ? "default" : "ghost"}
            size="icon"
            onClick={onConnect}
            disabled={connectState === "mutual"}
            title="Connect"
          >
            <Heart className={cn("size-4", connectState === "mutual" && "fill-current")} />
          </Button>
          <ReportDialog
            onSubmit={onReport}
            trigger={
              <Button variant="ghost" size="icon" title="Report">
                <Shield className="size-4" />
              </Button>
            }
          />
          <Button variant="ghost" size="icon" onClick={onBlock} title="Block">
            <Ban className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onLeave}>
            Leave
          </Button>
          <Button onClick={onNext}>
            <SkipForward className="size-4" />
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
