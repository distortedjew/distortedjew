import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { connectLiveSync } from "@/lib/live-sync";
import { wsManager } from "@/lib/ws";

/**
 * Starts the WebSocket once and wires its frames into the query cache and live store.
 * The connection lives for the whole page; unmounting only detaches the cache wiring.
 */
export function LiveDataProvider() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const dispose = connectLiveSync(queryClient, wsManager);
    wsManager.start();
    return dispose;
  }, [queryClient]);
  return null;
}
