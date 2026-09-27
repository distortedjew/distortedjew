import { prisma } from "@/lib/db/client";
import { joinQueue, leaveQueue } from "@/lib/matchmaking/engine";
import { getIceServers } from "@/lib/webrtc/ice-config";
import { getRandomIcebreaker } from "@/lib/icebreakers";
import { trackEvent } from "@/lib/analytics/track";
import type { ConnectionMeta } from "../registry";
import { sendTo } from "../registry";
import type { ClientMessage, MatchFilters, PublicPeerInfo } from "@/types/ws";

const MAX_INTERESTS = 8;

function sanitizeFilters(input: MatchFilters): MatchFilters {
  return {
    mode: input.mode,
    channel: input.channel,
    interests: Array.isArray(input.interests) ? input.interests.slice(0, MAX_INTERESTS) : [],
    language: input.language || null,
    country: input.country || null,
  };
}

async function buildPeerInfo(
  matchId: string,
  selfId: string,
  peerId: string,
  channel: MatchFilters["channel"],
  sharedInterests: string[],
  isInitiator: boolean,
): Promise<PublicPeerInfo> {
  const peer = await prisma.user.findUnique({
    where: { id: peerId },
    select: {
      isGuest: true,
      trustScore: true,
      profile: { select: { displayName: true, avatarUrl: true, country: true, visibility: true } },
    },
  });

  const showCountry = peer?.profile?.visibility !== "PRIVATE";

  return {
    matchId,
    peerId,
    peerDisplayName: peer?.profile?.displayName || "Someone new",
    peerAvatarUrl: peer?.profile?.avatarUrl ?? null,
    peerCountry: showCountry ? (peer?.profile?.country ?? null) : null,
    peerIsGuest: peer?.isGuest ?? true,
    peerTrusted: (peer?.trustScore ?? 0) >= 70,
    sharedInterests,
    channel,
    isInitiator,
    iceServers: getIceServers(),
  };
}

export async function handleQueueJoin(
  meta: ConnectionMeta,
  msg: Extract<ClientMessage, { type: "queue:join" }>,
) {
  const filters = sanitizeFilters(msg.filters);

  const result = await joinQueue(meta.userId, filters);

  if (!result) {
    sendTo(meta.userId, {
      type: "queue:searching",
      queuedAt: new Date().toISOString(),
      estimatedSeconds: 8,
    });
    return;
  }

  trackEvent(meta.userId, "match_started", {
    mode: result.mode,
    channel: result.channel,
  });

  const icebreaker = getRandomIcebreaker();

  const [peerInfoForA, peerInfoForB] = await Promise.all([
    buildPeerInfo(
      result.matchId,
      result.userAId,
      result.userBId,
      result.channel,
      result.sharedInterests,
      true,
    ),
    buildPeerInfo(
      result.matchId,
      result.userBId,
      result.userAId,
      result.channel,
      result.sharedInterests,
      false,
    ),
  ]);

  sendTo(result.userAId, { type: "queue:matched", peer: peerInfoForA, icebreaker });
  sendTo(result.userBId, { type: "queue:matched", peer: peerInfoForB, icebreaker });
}

export async function handleQueueLeave(meta: ConnectionMeta) {
  await leaveQueue(meta.userId);
  sendTo(meta.userId, { type: "queue:cancelled" });
}
