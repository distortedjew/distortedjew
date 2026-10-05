import { cn } from "@/lib/cn";

/** Shared look of text-like form controls (Input, Textarea, NumberInput). */
export const fieldControlClass = cn(
  "w-full min-w-0 rounded-lg border border-line-strong bg-surface-2 text-fg placeholder:text-fg-subtle/80 transition-colors",
  "hover:border-fg/20 focus:border-accent/60 focus:outline-none focus-visible:outline-none focus:ring-3 focus:ring-accent/15",
  "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-down/60 aria-invalid:focus:ring-down/15",
);
