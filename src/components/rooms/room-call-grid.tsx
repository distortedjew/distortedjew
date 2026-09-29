"use client";

import { useEffect, useRef } from "react";
import { CameraOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRoomWebRtc } from "@/hooks/use-room-webrtc";
import { MEDIA_ERROR_COPY } from "@/lib/media";
import type { RoomChannel, RoomParticipantView } from "@/types/ws";

function Tile({
  stream,
  isVideo,
  displayName,
  avatarUrl,
  muted,
  isLocal,
}: {
  stream: MediaStream | null;
  isVideo: boolean;
  displayName: string;
  avatarUrl: string | null;
  muted?: boolean;
  isLocal?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (isVideo && videoRef.current) {
      videoRef.current.srcObject = stream;
      if (stream) videoRef.current.play().catch(() => undefined);
    }
    if (!isVideo && audioRef.current && !isLocal) {
      audioRef.current.srcObject = stream;
      if (stream) audioRef.current.play().catch(() => undefined);
    }
  }, [stream, isVideo, isLocal]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-border/60 bg-black">
      {isVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} className="h-full w-full object-cover" />
      ) : (
        <audio ref={audioRef} autoPlay />
      )}
      {(!isVideo || !stream) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-background/80 to-muted/80">
          <Avatar className="size-10">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur">
        {muted && <MicOff className="size-3" />}
        {displayName}
        {isLocal && " (you)"}
      </div>
    </div>
  );
}

export function RoomCallGrid({
  roomId,
  channel,
  participants,
  selfId,
  active,
  onPeersReady,
}: {
  roomId: string;
  channel: RoomChannel;
  participants: RoomParticipantView[];
  selfId: string;
  active: boolean;
  onPeersReady?: (helpers: { connectToPeer: (id: string) => void; disconnectFromPeer: (id: string) => void }) => void;
}) {
  const {
    localStream,
    remoteStreams,
    cameraOn,
    micOn,
    mediaError,
    toggleCamera,
    toggleMic,
    connectToPeer,
    disconnectFromPeer,
  } = useRoomWebRtc({ roomId, channel, active });

  useEffect(() => {
    onPeersReady?.({ connectToPeer, disconnectFromPeer });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectToPeer, disconnectFromPeer]);

  const isVideo = channel === "VIDEO";
  const self = participants.find((p) => p.userId === selfId);
  const others = participants.filter((p) => p.userId !== selfId);

  return (
    <div className="flex shrink-0 flex-col gap-3 p-3 sm:p-4">
      {mediaError && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-left">
          <CameraOff className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <div className="text-sm font-medium">{MEDIA_ERROR_COPY[mediaError].title}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{MEDIA_ERROR_COPY[mediaError].body}</p>
          </div>
        </div>
      )}
      <div className="scrollbar-thin grid max-h-[40dvh] grid-cols-2 gap-2 overflow-y-auto sm:max-h-none sm:grid-cols-3 sm:gap-3">
        {self && (
          <Tile
            stream={localStream}
            isVideo={isVideo}
            displayName={self.displayName}
            avatarUrl={self.avatarUrl}
            muted={!micOn}
            isLocal
          />
        )}
        {others.map((p) => (
          <Tile
            key={p.userId}
            stream={remoteStreams[p.userId] ?? null}
            isVideo={isVideo}
            displayName={p.displayName}
            avatarUrl={p.avatarUrl}
            muted={p.mutedByHost}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant={micOn ? "secondary" : "destructive"}
          size="icon"
          onClick={toggleMic}
          disabled={!localStream}
          title={micOn ? "Mute" : "Unmute"}
          aria-label={micOn ? "Mute" : "Unmute"}
        >
          {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </Button>
        {isVideo && (
          <Button
            variant={cameraOn ? "secondary" : "destructive"}
            size="icon"
            onClick={toggleCamera}
            disabled={!localStream}
            title={cameraOn ? "Turn camera off" : "Turn camera on"}
            aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
          >
            {cameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
