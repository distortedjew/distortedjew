"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket, useSocketMessage } from "./socket-provider";
import type { MatchChannel, PublicPeerInfo } from "@/types/ws";
import { mediaErrorKind, requestUserMedia, type MediaErrorKind } from "@/lib/media";

export type PeerConnectionState =
  | "idle"
  | "requesting_media"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "closed";

export interface UseWebRtcOptions {
  matchId: string;
  channel: MatchChannel;
  isInitiator: boolean;
  iceServers: PublicPeerInfo["iceServers"];
  active: boolean;
}

export function useWebRtc({ matchId, channel, isInitiator, iceServers, active }: UseWebRtcOptions) {
  const { send } = useSocket();
  const [state, setState] = useState<PeerConnectionState>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(channel === "VIDEO");
  const [micOn, setMicOn] = useState(true);
  const [peerMediaState, setPeerMediaState] = useState({ camera: true, mic: true });
  const [mediaError, setMediaError] = useState<MediaErrorKind | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const offerClaimedRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Resolves once the peer connection exists with local tracks attached (or
  // never, if media/setup failed) — an incoming offer/ICE candidate that
  // arrives while getUserMedia is still pending awaits this instead of
  // being silently dropped by the `!pcRef.current` guard.
  const pcReadyRef = useRef<Promise<void>>(new Promise(() => {}));

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    remoteDescSetRef.current = false;
    offerClaimedRef.current = false;
    pendingCandidatesRef.current = [];
  }, []);

  useEffect(() => {
    if (!active) {
      // Nothing to start. If a previous run was active, its own cleanup
      // (below) already tore down the connection and reset state.
      return;
    }

    let cancelled = false;
    let resolvePcReady: () => void = () => {};
    pcReadyRef.current = new Promise((resolve) => {
      resolvePcReady = resolve;
    });

    async function start() {
      setState("requesting_media");
      setMediaError(null);
      let stream: MediaStream | null = null;
      try {
        stream = await requestUserMedia({
          audio: true,
          video: channel === "VIDEO" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
      } catch (err) {
        console.warn("[webrtc] failed to get local media", err);
        if (!cancelled) {
          setMediaError(mediaErrorKind(err));
          setState("failed");
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream!));
      resolvePcReady();

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0] ?? null);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: "webrtc:ice", matchId, candidate: event.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        if (cancelled) return;
        switch (pc.connectionState) {
          case "connected":
            setState("connected");
            break;
          case "disconnected":
            setState("reconnecting");
            break;
          case "failed":
            setState("failed");
            break;
          case "closed":
            setState("closed");
            break;
          default:
            setState("connecting");
        }
      };

      if (isInitiator) {
        setState("connecting");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "webrtc:offer", matchId, sdp: offer.sdp! });
      } else {
        setState("connecting");
      }

      send({ type: "webrtc:media_state", matchId, camera: channel === "VIDEO", mic: true });
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
      setState("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, matchId]);

  useSocketMessage("webrtc:offer", async (msg) => {
    if (msg.matchId !== matchId) return;
    await pcReadyRef.current;
    // Claim synchronously right after resuming (before any further await)
    // so a duplicate delivery of the same offer — e.g. React StrictMode's
    // dev-only double effect invocation — can't race in and call
    // setRemoteDescription twice.
    if (!pcRef.current || offerClaimedRef.current) return;
    offerClaimedRef.current = true;
    await pcRef.current.setRemoteDescription({ type: "offer", sdp: msg.sdp });
    remoteDescSetRef.current = true;
    for (const c of pendingCandidatesRef.current) await pcRef.current.addIceCandidate(c);
    pendingCandidatesRef.current = [];
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);
    send({ type: "webrtc:answer", matchId, sdp: answer.sdp! });
  });

  useSocketMessage("webrtc:answer", async (msg) => {
    if (msg.matchId !== matchId || !pcRef.current) return;
    await pcRef.current.setRemoteDescription({ type: "answer", sdp: msg.sdp });
    remoteDescSetRef.current = true;
    for (const c of pendingCandidatesRef.current) await pcRef.current.addIceCandidate(c);
    pendingCandidatesRef.current = [];
  });

  useSocketMessage("webrtc:ice", async (msg) => {
    if (msg.matchId !== matchId) return;
    const candidate = msg.candidate as RTCIceCandidateInit;
    if (!pcRef.current) {
      // Media (and therefore the peer connection) may still be loading;
      // buffer until it exists rather than dropping the candidate.
      pendingCandidatesRef.current.push(candidate);
      return;
    }
    if (remoteDescSetRef.current) {
      await pcRef.current.addIceCandidate(candidate).catch(() => undefined);
    } else {
      pendingCandidatesRef.current.push(candidate);
    }
  });

  useSocketMessage("webrtc:media_state", (msg) => {
    if (msg.matchId !== matchId) return;
    setPeerMediaState({ camera: msg.camera, mic: msg.mic });
  });

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOn;
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    setCameraOn(next);
    send({ type: "webrtc:media_state", matchId, camera: next, mic: micOn });
  }, [cameraOn, micOn, matchId, send]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
    send({ type: "webrtc:media_state", matchId, camera: cameraOn, mic: next });
  }, [micOn, cameraOn, matchId, send]);

  return {
    state,
    localStream,
    remoteStream,
    cameraOn,
    micOn,
    peerMediaState,
    mediaError,
    toggleCamera,
    toggleMic,
  };
}
