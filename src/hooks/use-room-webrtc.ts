"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket, useSocketMessage } from "./socket-provider";
import type { RoomChannel, RTCIceServerConfig } from "@/types/ws";
import { mediaErrorKind, requestUserMedia, type MediaErrorKind } from "@/lib/media";

const FALLBACK_ICE_SERVERS: RTCIceServerConfig[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

interface PeerConn {
  pc: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  remoteDescSet: boolean;
}

/**
 * Full-mesh group WebRTC: one RTCPeerConnection per other participant.
 * A newcomer always initiates offers to everyone already present, so there
 * is never a glare between two sides both trying to offer at once.
 */
export function useRoomWebRtc({
  roomId,
  channel,
  active,
}: {
  roomId: string;
  channel: RoomChannel;
  active: boolean;
}) {
  const { send } = useSocket();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [cameraOn, setCameraOn] = useState(channel === "VIDEO");
  const [micOn, setMicOn] = useState(true);
  const [mediaError, setMediaError] = useState<MediaErrorKind | null>(null);

  const peersRef = useRef<Map<string, PeerConn>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServerConfig[]>(FALLBACK_ICE_SERVERS);
  // Resolves once getUserMedia settles (to the stream, or null on failure/
  // inactive). Peer connections are only ever created after awaiting this,
  // so local tracks are always attached before an offer/answer is built —
  // otherwise a peer connection created while media is still loading would
  // negotiate with no outgoing track and never renegotiate one in later.
  const localStreamReadyRef = useRef<Promise<MediaStream | null>>(Promise.resolve(null));

  useEffect(() => {
    if (!active || channel === "TEXT") return;
    let cancelled = false;
    const peers = peersRef.current;

    fetch("/api/ice-servers")
      .then((res) => res.json())
      .then((data: { iceServers?: RTCIceServerConfig[] }) => {
        if (!cancelled && data.iceServers) iceServersRef.current = data.iceServers;
      })
      .catch(() => undefined);

    localStreamReadyRef.current = requestUserMedia({ audio: true, video: channel === "VIDEO" })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return null;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      })
      .catch((err) => {
        console.warn("[room-webrtc] getUserMedia failed", err);
        if (!cancelled) setMediaError(mediaErrorKind(err));
        return null;
      });

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      for (const { pc } of peers.values()) pc.close();
      peers.clear();
      setRemoteStreams({});
      setLocalStream(null);
      setMediaError(null);
    };
  }, [active, channel]);

  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const entry: PeerConn = { pc, pendingCandidates: [], remoteDescSet: false };
      peersRef.current.set(peerId, entry);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));
      }

      pc.ontrack = (event) => {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: event.streams[0] }));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: "room:webrtc_ice",
            roomId,
            toUserId: peerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          peersRef.current.delete(peerId);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }
      };

      return pc;
    },
    [roomId, send],
  );

  const connectToPeer = useCallback(
    async (peerId: string) => {
      if (peersRef.current.has(peerId)) return;
      await localStreamReadyRef.current;
      if (peersRef.current.has(peerId)) return; // re-check: a concurrent offer may have arrived while awaiting
      const pc = createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "room:webrtc_offer", roomId, toUserId: peerId, sdp: offer.sdp! });
    },
    [createPeerConnection, roomId, send],
  );

  const disconnectFromPeer = useCallback((peerId: string) => {
    const entry = peersRef.current.get(peerId);
    if (entry) {
      entry.pc.close();
      peersRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  useSocketMessage("room:webrtc_offer", async (msg) => {
    if (msg.roomId !== roomId) return;
    // Synchronous check-and-create: a peer connection is only ever created
    // for an incoming offer once, even if the same offer is delivered
    // twice in a row (e.g. React StrictMode's dev-only double effect
    // invocation briefly double-subscribes the message listener).
    if (peersRef.current.has(msg.fromUserId)) return;
    await localStreamReadyRef.current;
    if (peersRef.current.has(msg.fromUserId)) return;
    createPeerConnection(msg.fromUserId);
    const entry = peersRef.current.get(msg.fromUserId)!;

    await entry.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
    entry.remoteDescSet = true;
    for (const c of entry.pendingCandidates) await entry.pc.addIceCandidate(c);
    entry.pendingCandidates = [];
    const answer = await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);
    send({ type: "room:webrtc_answer", roomId, toUserId: msg.fromUserId, sdp: answer.sdp! });
  });

  useSocketMessage("room:webrtc_answer", async (msg) => {
    if (msg.roomId !== roomId) return;
    const entry = peersRef.current.get(msg.fromUserId);
    if (!entry) return;
    await entry.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
    entry.remoteDescSet = true;
    for (const c of entry.pendingCandidates) await entry.pc.addIceCandidate(c);
    entry.pendingCandidates = [];
  });

  useSocketMessage("room:webrtc_ice", async (msg) => {
    if (msg.roomId !== roomId) return;
    const entry = peersRef.current.get(msg.fromUserId);
    if (!entry) return;
    const candidate = msg.candidate as RTCIceCandidateInit;
    if (entry.remoteDescSet) {
      await entry.pc.addIceCandidate(candidate).catch(() => undefined);
    } else {
      entry.pendingCandidates.push(candidate);
    }
  });

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOn;
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    setCameraOn(next);
  }, [cameraOn]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }, [micOn]);

  return {
    localStream,
    remoteStreams,
    cameraOn,
    micOn,
    mediaError,
    toggleCamera,
    toggleMic,
    connectToPeer,
    disconnectFromPeer,
  };
}
