import type { MatchChannel } from "@/types/ws";

export const mmKeys = {
  queue: (channel: MatchChannel) => `mm:queue:${channel}`,
  ticket: (userId: string) => `mm:ticket:${userId}`,
  activeMatch: (userId: string) => `mm:active:${userId}`,
  matchState: (matchId: string) => `match:${matchId}`,
  recentPair: (a: string, b: string) => {
    const [x, y] = [a, b].sort();
    return `mm:recent:${x}:${y}`;
  },
  blocklist: (userId: string) => `blocklist:${userId}`,
  presence: () => `presence:online`,
};
