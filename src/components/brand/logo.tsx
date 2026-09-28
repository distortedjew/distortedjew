import { cn } from "@/lib/utils";

/** The Wisp mark on its own — a single curling wisp trail. Inherits color via currentColor. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M17 47 C 15 33, 22 19, 36 16 C 46 14, 53 20, 52 27 C 51 33, 44 35, 41 30 C 39 27, 41 23, 45 24"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="17" cy="47" r="3.6" fill="currentColor" />
    </svg>
  );
}

/** The mark on its gradient badge — the app's icon as used in nav bars, auth screens, etc. */
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
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-white",
        size,
        className,
      )}
    >
      <LogoMark className={iconSize} />
    </span>
  );
}
