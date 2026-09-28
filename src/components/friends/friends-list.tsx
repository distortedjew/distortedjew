"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users2, UserX, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { countryName } from "@/lib/countries";

export interface Friend {
  connectionId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  country: string | null;
  interests: string[];
}

export function FriendsList({ friends: initialFriends }: { friends: Friend[] }) {
  const [friends, setFriends] = useState(initialFriends);

  async function remove(connectionId: string) {
    const res = await fetch(`/api/friends/${connectionId}`, { method: "DELETE" });
    if (res.ok) {
      setFriends((prev) => prev.filter((f) => f.connectionId !== connectionId));
      toast.success("Connection removed.");
    } else {
      toast.error("Could not remove connection.");
    }
  }

  async function block(friend: Friend) {
    const res = await fetch("/api/block", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: friend.userId }),
    });
    if (res.ok) {
      setFriends((prev) => prev.filter((f) => f.connectionId !== friend.connectionId));
      toast.success(`Blocked ${friend.displayName}.`);
    } else {
      toast.error("Could not block user.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold">Friends</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        People you&apos;ve mutually connected with during a conversation.
      </p>

      {friends.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users2 className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No connections yet. Hit the ❤️ button during a chat to connect with someone.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {friends.map((friend) => (
            <Card key={friend.connectionId}>
              <CardContent className="flex items-center gap-3 py-4">
                <Avatar>
                  <AvatarImage src={friend.avatarUrl ?? undefined} />
                  <AvatarFallback>{friend.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-medium">{friend.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {countryName(friend.country) ?? "Location hidden"}
                    {friend.interests.length > 0 && ` · ${friend.interests.slice(0, 2).join(", ")}`}
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(friend.connectionId)} title="Remove">
                  <UserX className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => block(friend)} title="Block">
                  <Ban className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
