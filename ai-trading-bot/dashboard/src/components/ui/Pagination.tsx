import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatInt } from "@/lib/format";
import { IconButton } from "@/components/ui/IconButton";

export interface PaginationProps {
  offset: number;
  limit: number;
  total: number;
  onOffsetChange: (offset: number) => void;
  /** Disable while a page is loading. */
  disabled?: boolean;
  className?: string;
  /** Noun for the summary line ("trades", "decisions"). */
  noun?: string;
}

/** Offset pagination for API pages (`limit` / `offset` / `total`): "1–50 of 1,284 trades ‹ ›". */
export function Pagination({ offset, limit, total, onOffsetChange, disabled, className, noun = "rows" }: PaginationProps) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;
  return (
    <div className={cn("flex items-center justify-between gap-3 text-xs text-fg-subtle", className)}>
      <span className="num">
        {formatInt(from)}–{formatInt(to)} of {formatInt(total)} {noun}
      </span>
      <div className="flex items-center gap-1">
        <IconButton
          icon={ChevronLeft}
          label="Previous page"
          size="xs"
          variant="outline"
          disabled={disabled || !canPrev}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        />
        <IconButton
          icon={ChevronRight}
          label="Next page"
          size="xs"
          variant="outline"
          disabled={disabled || !canNext}
          onClick={() => onOffsetChange(offset + limit)}
        />
      </div>
    </div>
  );
}
