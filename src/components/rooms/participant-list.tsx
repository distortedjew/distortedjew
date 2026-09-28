"use client";

import { MicOff, Crown, MoreVertical, Ban, Flag, UserMinus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { RoomParticipantView } from "@/types/ws";

export function ParticipantList({
  participants,
  selfId,
  isSelfHost,
  onMute,
  onRemove,
  onBlock,
  onReport,
}: {
  participants: RoomParticipantView[];
  selfId: string;
  isSelfHost: boolean;
  onMute: (userId: string, muted: boolean) => void;
  onRemove: (userId: string) => void;
  onBlock: (userId: string) => void;
  onReport: (userId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">
        {participants.length} in the room
      </div>
      {participants.map((p) => (
        <div key={p.userId} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent">
          <Avatar className="size-7">
            <AvatarImage src={p.avatarUrl ?? undefined} />
            <AvatarFallback className="text-xs">{p.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate text-sm">{p.displayName}</span>
          {p.role === "HOST" && <Crown className="size-3.5 text-primary" />}
          {p.mutedByHost && <MicOff className="size-3.5 text-muted-foreground" />}
          {p.userId !== selfId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="size-6">
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isSelfHost && (
                  <>
                    <DropdownMenuItem onSelect={() => onMute(p.userId, !p.mutedByHost)}>
                      <MicOff /> {p.mutedByHost ? "Unmute" : "Mute"}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => onRemove(p.userId)}>
                      <UserMinus /> Remove from room
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onSelect={() => onReport(p.userId)}>
                  <Flag /> Report
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => onBlock(p.userId)}>
                  <Ban /> Block
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}
    </div>
  );
}

export function RoomBadgeRow({ channel }: { channel: string }) {
  return <Badge variant="secondary">{channel}</Badge>;
}
