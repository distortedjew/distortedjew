import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";

/** Copies `value` to the clipboard (ids, prices) with a brief ✓ confirmation. */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_400);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Tooltip content={copied ? "Copied" : label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-fg/[0.07] hover:text-fg",
          className,
        )}
      >
        {copied ? <Check className="size-3.5 text-up" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </Tooltip>
  );
}
