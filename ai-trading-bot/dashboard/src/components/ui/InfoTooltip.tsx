import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";

/**
 * ⓘ icon that explains a metric on hover / focus / tap.
 *
 *   <span className="label-caps">Profit factor</span> <InfoTooltip content="Gross profit ÷ gross loss…" />
 */
export function InfoTooltip({
  content,
  label = "More information",
  side = "top",
  className,
}: {
  content: ReactNode;
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-fg-subtle/80 transition-colors",
          "hover:text-fg-muted focus-visible:text-fg-muted",
          className,
        )}
      >
        <Info className="size-3" strokeWidth={2} aria-hidden />
      </button>
    </Tooltip>
  );
}
