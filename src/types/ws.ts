// Shared WebSocket protocol types between the client and the realtime
// gateway (server/ws). Keep this file dependency-free (no server-only code)
// so it can be imported from both sides.

export type MatchMode =
  | "RANDOM"
  | "INTERESTS"
  | "SAME_LANGUAGE"
  | "LANGUAGE_EXCHANGE"
  | "SAME_COUNTRY"
  | "WORLDWIDE"
  | "GAMING"
  | "MUSIC"
  | "JUST_TALKING";

export type MatchChannel = "TEXT" | "VOICE" | "VIDEO";

export interface MatchFilters {
  mode: MatchMode;
  channel: MatchChannel;
  interests: string[];
  language: string | null;
  country: string | null;
}

export interface PublicPeerInfo {
  matchId: string;
  peerId: string;
  peerDisplayName: string;
  peerAvatarUrl: string | null;
  peerCountry: string | null;
  peerIsGuest: boolean;
  peerTrusted: boolean;
  sharedInterests: string[];
  channel: MatchChannel;
  isInitiator: boolean;
  iceServers: RTCIceServerConfig[];
}

export interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ChatMessagePayload {
  id: string;
  matchId?: string;
  roomId?: string;
  senderId: string;
  senderName: string;
  body: string;
  kind: "TEXT" | "SYSTEM" | "REACTION" | "GIF" | "IMAGE" | "GAME_EVENT" | "MUSIC_SHARE";
  translatedBody?: string;
  translatedLang?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ---- Client -> Server ----
export type ClientMessage =
  | { type: "queue:join"; filters: MatchFilters }
  | { type: "queue:leave" }
  | { type: "chat:message"; matchId: string; body: string; kind?: ChatMessagePayload["kind"]; metadata?: Record<string, unknown> }
  | { type: "chat:typing"; matchId: string; isTyping: boolean }
  | { type: "chat:reaction"; matchId: string; emoji: string }
  | { type: "chat:next"; matchId: string }
  | { type: "chat:leave"; matchId: string }
  | { type: "chat:connect_request"; matchId: string }
  | { type: "chat:report"; matchId: string; category: string; description?: string }
  | { type: "chat:block"; matchId: string }
  | { type: "webrtc:offer"; matchId: string; sdp: string }
  | { type: "webrtc:answer"; matchId: string; sdp: string }
  | { type: "webrtc:ice"; matchId: string; candidate: unknown }
  | { type: "webrtc:media_state"; matchId: string; camera: boolean; mic: boolean }
  | { type: "icebreaker:request"; matchId: string }
  | { type: "room:join"; roomId: string }
  | { type: "room:leave"; roomId: string }
  | { type: "room:message"; roomId: string; body: string }
  | { type: "game:invite"; matchId?: string; roomId?: string; gameType: string }
  | { type: "game:accept"; sessionId: string }
  | { type: "game:action"; sessionId: string; action: Record<string, unknown> }
  | { type: "game:draw"; sessionId: string; stroke: DrawStroke }
  | { type: "presence:ping" };

export interface DrawStroke {
  kind: "start" | "move" | "end" | "clear";
  x?: number;
  y?: number;
}

// ---- Server -> Client ----
export type ServerMessage =
  | { type: "queue:searching"; queuedAt: string; estimatedSeconds: number }
  | { type: "queue:matched"; peer: PublicPeerInfo; icebreaker: string }
  | { type: "queue:cancelled" }
  | { type: "chat:message"; message: ChatMessagePayload }
  | { type: "chat:typing"; matchId: string; peerId: string; isTyping: boolean }
  | { type: "chat:reaction"; matchId: string; peerId: string; emoji: string }
  | { type: "chat:partner_left"; matchId: string; reason: "next" | "disconnect" | "reported" }
  | { type: "chat:ended"; matchId: string }
  | { type: "chat:connect_pending" }
  | { type: "chat:connect_mutual"; connectionId: string; peerUsername: string }
  | { type: "webrtc:offer"; matchId: string; sdp: string }
  | { type: "webrtc:answer"; matchId: string; sdp: string }
  | { type: "webrtc:ice"; matchId: string; candidate: unknown }
  | { type: "webrtc:media_state"; matchId: string; camera: boolean; mic: boolean }
  | { type: "icebreaker:prompt"; matchId: string; prompt: string }
  | { type: "room:joined"; roomId: string; participants: RoomParticipantView[] }
  | { type: "room:participant_joined"; roomId: string; participant: RoomParticipantView }
  | { type: "room:participant_left"; roomId: string; userId: string }
  | { type: "room:message"; roomId: string; message: ChatMessagePayload }
  | { type: "game:invited"; sessionId: string; gameType: string; fromUserId: string }
  | { type: "game:state"; sessionId: string; state: Record<string, unknown> }
  | { type: "game:draw"; sessionId: string; stroke: DrawStroke }
  | { type: "notification"; notification: { id: string; type: string; title: string; body?: string } }
  | { type: "error"; code: string; message: string }
  | { type: "presence:pong" };

export interface RoomParticipantView {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: "HOST" | "MODERATOR" | "MEMBER";
  mutedByHost: boolean;
}
