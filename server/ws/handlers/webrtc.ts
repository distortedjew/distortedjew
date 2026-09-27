import { getMatchState } from "@/lib/matchmaking/engine";
import { sendTo } from "../registry";
import type { ConnectionMeta } from "../registry";
import type { ClientMessage } from "@/types/ws";

async function peerFor(matchId: string, selfId: string): Promise<string | null> {
  const state = await getMatchState(matchId);
  if (!state) return null;
  if (state.userAId !== selfId && state.userBId !== selfId) return null;
  return state.userAId === selfId ? state.userBId : state.userAId;
}

export async function handleWebrtcOffer(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "webrtc:offer" }>,
) {
  const peerId = await peerFor(msg.matchId, meta.userId);
  if (!peerId) return;
  sendTo(peerId, { type: "webrtc:offer", matchId: msg.matchId, sdp: msg.sdp });
}

export async function handleWebrtcAnswer(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "webrtc:answer" }>,
) {
  const peerId = await peerFor(msg.matchId, meta.userId);
  if (!peerId) return;
  sendTo(peerId, { type: "webrtc:answer", matchId: msg.matchId, sdp: msg.sdp });
}

export async function handleWebrtcIce(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "webrtc:ice" }>,
) {
  const peerId = await peerFor(msg.matchId, meta.userId);
  if (!peerId) return;
  sendTo(peerId, { type: "webrtc:ice", matchId: msg.matchId, candidate: msg.candidate });
}

export async function handleWebrtcMediaState(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "webrtc:media_state" }>,
) {
  const peerId = await peerFor(msg.matchId, meta.userId);
  if (!peerId) return;
  sendTo(peerId, {
    type: "webrtc:media_state",
    matchId: msg.matchId,
    camera: msg.camera,
    mic: msg.mic,
  });
}
