import { cn } from "@/lib/utils";

/**
 * The Wisp mark: a trail ending in a small light. The trail inherits
 * currentColor; the light is glow-colored unless `mono` is set.
 */
export function LogoMark({ className, mono = false }: { className?: string; mono?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M17 47 C 15 33, 22 19, 36 16 C 46 14, 53 20, 52 27 C 51 33, 44 35, 41 30 C 39 27, 41 23, 45 24"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="17" cy="47" r="4.4" fill={mono ? "currentColor" : "var(--color-glow)"} />
    </svg>
  );
}

/** The mark on its violet badge, as used in nav bars and auth screens. */
export function Logo({
  size = "size-8",
  iconSize = "size-4",
  className,
}: {
  size?: string;
  iconSize?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[30%] bg-[#6B4EFF] text-white",
        size,
        className,
      )}
    >
      <LogoMark className={iconSize} />
    </span>
  );
}
