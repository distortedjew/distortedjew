import { redis } from "@/lib/redis/client";
import { prisma } from "@/lib/db/client";
import { mmKeys } from "./keys";
import { isBlocked } from "./blocklist";
import { RECENT_MATCH_COOLDOWN_SECONDS } from "@/lib/constants";
import type { MatchChannel, MatchFilters } from "@/types/ws";

const TICKET_TTL_SECONDS = 120;
const CANDIDATE_SCAN_LIMIT = 40;

interface Ticket extends MatchFilters {
  userId: string;
  joinedAt: number;
}

export interface ResolvedMatch {
  matchId: string;
  userAId: string;
  userBId: string;
  mode: MatchFilters["mode"];
  channel: MatchChannel;
  sharedInterests: string[];
}

/**
 * Very small in-process async lock so matchmaking reads+writes stay
 * atomic within a single Node process. Horizontal scaling beyond one
 * gateway instance would replace this with a Redis Lua script (the
 * candidate-scan + pop-and-pair sequence below is written so it can be
 * ported to a single EVAL call without changing the matching heuristic).
 */
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn);
  chain = result.catch(() => undefined);
  return result;
}

function scoreCompatibility(a: Ticket, b: Ticket): number {
  let score = 1; // baseline: everyone in the same channel queue is a candidate
  const sharedInterests = a.interests.filter((i) => b.interests.includes(i));
  score += sharedInterests.length * 3;
  if (a.language && b.language && a.language === b.language) score += 4;
  if (a.country && b.country && a.country === b.country) score += 2;

  switch (a.mode) {
    case "INTERESTS":
      if (sharedInterests.length === 0) return -1;
      break;
    case "SAME_LANGUAGE":
      if (!a.language || a.language !== b.language) return -1;
      break;
    case "LANGUAGE_EXCHANGE":
      if (!a.language || !b.language || a.language === b.language) return -1;
      break;
    case "SAME_COUNTRY":
      if (!a.country || a.country !== b.country) return -1;
      break;
    case "GAMING":
      if (!b.interests.includes("Gaming")) return -1;
      break;
    case "MUSIC":
      if (!b.interests.includes("Music")) return -1;
      break;
    default:
      break;
  }
  return score;
}

function sharedInterestsOf(a: Ticket, b: Ticket): string[] {
  return a.interests.filter((i) => b.interests.includes(i));
}

async function loadTicket(userId: string): Promise<Ticket | null> {
  const raw = await redis.get(mmKeys.ticket(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Ticket;
  } catch {
    return null;
  }
}

async function isRecentlyMatched(a: string, b: string): Promise<boolean> {
  const exists = await redis.exists(mmKeys.recentPair(a, b));
  return exists === 1;
}

/**
 * Enqueues a user and immediately attempts to resolve a match. Returns the
 * resolved match if one was found, otherwise null (the user stays queued).
 */
export async function joinQueue(
  userId: string,
  filters: MatchFilters,
): Promise<ResolvedMatch | null> {
  return withLock(async () => {
    const ticket: Ticket = { ...filters, userId, joinedAt: Date.now() };
    await redis.set(
      mmKeys.ticket(userId),
      JSON.stringify(ticket),
      "EX",
      TICKET_TTL_SECONDS,
    );

    const queueKey = mmKeys.queue(filters.channel);
    const candidateIds = await redis.lrange(queueKey, 0, CANDIDATE_SCAN_LIMIT - 1);

    let best: { candidate: Ticket; score: number } | null = null;

    for (const candidateId of candidateIds) {
      if (candidateId === userId) continue;
      const candidateTicket = await loadTicket(candidateId);
      if (!candidateTicket) continue; // expired / already matched elsewhere

      const [blocked, blockedReverse, recently] = await Promise.all([
        isBlocked(userId, candidateId),
        isBlocked(candidateId, userId),
        isRecentlyMatched(userId, candidateId),
      ]);
      if (blocked || blockedReverse || recently) continue;

      const scoreForward = scoreCompatibility(ticket, candidateTicket);
      const scoreBackward = scoreCompatibility(candidateTicket, ticket);
      if (scoreForward < 0 || scoreBackward < 0) continue;

      const score = scoreForward + scoreBackward;
      if (!best || score > best.score) {
        best = { candidate: candidateTicket, score };
      }
    }

    if (!best) {
      await redis.rpush(queueKey, userId);
      return null;
    }

    // Pair found: remove both from the queue and ticket store.
    await Promise.all([
      redis.lrem(queueKey, 0, best.candidate.userId),
      redis.lrem(queueKey, 0, userId),
      redis.del(mmKeys.ticket(userId)),
      redis.del(mmKeys.ticket(best.candidate.userId)),
    ]);

    const match = await prisma.match.create({
      data: {
        userAId: userId,
        userBId: best.candidate.userId,
        mode: filters.mode,
        channel: filters.channel,
        sharedInterests: sharedInterestsOf(ticket, best.candidate),
      },
    });

    const matchState = {
      matchId: match.id,
      userAId: userId,
      userBId: best.candidate.userId,
      mode: filters.mode,
      channel: filters.channel,
    };

    await Promise.all([
      redis.set(mmKeys.activeMatch(userId), match.id, "EX", 60 * 60 * 6),
      redis.set(mmKeys.activeMatch(best.candidate.userId), match.id, "EX", 60 * 60 * 6),
      redis.set(mmKeys.matchState(match.id), JSON.stringify(matchState), "EX", 60 * 60 * 6),
    ]);

    return {
      matchId: match.id,
      userAId: userId,
      userBId: best.candidate.userId,
      mode: filters.mode,
      channel: filters.channel,
      sharedInterests: sharedInterestsOf(ticket, best.candidate),
    };
  });
}

const ALL_CHANNELS: MatchChannel[] = ["TEXT", "VOICE", "VIDEO"];

export async function leaveQueue(userId: string, channel?: MatchChannel) {
  const channels = channel ? [channel] : ALL_CHANNELS;
  await Promise.all([
    ...channels.map((c) => redis.lrem(mmKeys.queue(c), 0, userId)),
    redis.del(mmKeys.ticket(userId)),
  ]);
}

export async function getActiveMatchId(userId: string): Promise<string | null> {
  return redis.get(mmKeys.activeMatch(userId));
}

export async function getMatchState(matchId: string) {
  const raw = await redis.get(mmKeys.matchState(matchId));
  if (!raw) return null;
  return JSON.parse(raw) as {
    matchId: string;
    userAId: string;
    userBId: string;
    mode: MatchFilters["mode"];
    channel: MatchChannel;
  };
}

export async function endMatch(
  matchId: string,
  endedByUserId: string,
  reason: "NEXT" | "DISCONNECT" | "REPORTED" | "TIMEOUT" | "ERROR",
) {
  const state = await getMatchState(matchId);
  if (!state) return null;

  await Promise.all([
    redis.del(mmKeys.activeMatch(state.userAId)),
    redis.del(mmKeys.activeMatch(state.userBId)),
    redis.del(mmKeys.matchState(matchId)),
    redis.set(
      mmKeys.recentPair(state.userAId, state.userBId),
      "1",
      "EX",
      RECENT_MATCH_COOLDOWN_SECONDS,
    ),
  ]);

  await prisma.match
    .update({
      where: { id: matchId },
      data: { endedAt: new Date(), endReason: reason, endedByUserId },
    })
    .catch(() => undefined);

  return state;
}
