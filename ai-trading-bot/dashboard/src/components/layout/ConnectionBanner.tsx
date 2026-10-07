import { AnimatePresence, motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { useConnection } from "@/hooks/live";
import { useConnectionMessage } from "@/hooks/use-connection-message";
import { cn } from "@/lib/cn";
import { motionPresets } from "@/lib/motion";
import { Button } from "@/components/ui/Button";

/** Slim banner under the navigation for connection / engine problems, in plain language. */
export function ConnectionBanner() {
  const message = useConnectionMessage();
  const { retryNow } = useConnection();
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.div
          key={message.key}
          {...motionPresets.banner}
          className="overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <div
            className={cn(
              "border-b px-4 py-2 sm:px-6 lg:px-8",
              message.tone === "down"
                ? "border-down/25 bg-down/[0.09]"
                : "border-warning/25 bg-warning/[0.08]",
            )}
          >
            <div className="mx-auto flex max-w-[1760px] items-center gap-3 text-dense">
              <message.icon
                className={cn("size-4 shrink-0", message.tone === "down" ? "text-down" : "text-warning")}
                aria-hidden
              />
              <p className="min-w-0 flex-1 leading-5">
                <span className="font-medium text-fg">{message.title}</span>{" "}
                {message.detail ? <span className="text-fg-muted">{message.detail}</span> : null}
              </p>
              {message.retry ? (
                <Button size="xs" variant="ghost" leftIcon={RotateCw} onClick={retryNow} className="shrink-0">
                  Retry now
                </Button>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
