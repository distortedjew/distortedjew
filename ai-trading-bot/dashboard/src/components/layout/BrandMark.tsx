import { useId } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/cn";

/** Logo mark: a rising signal line ending in an AI node. */
export function LogoMark({ className }: { className?: string }) {
  const id = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7C8CFF" />
          <stop offset="1" stopColor="#B4A0FF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" className="fill-surface-3 dark:fill-[#0e131b]" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#7C8CFF" strokeOpacity="0.35" />
      <path
        d="M7.5 21.5l5-5.25 4 3.25 8-8.5"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.5" cy="11" r="2.25" fill="#B4A0FF" />
    </svg>
  );
}

/** Logo + wordmark, linking home. */
export function BrandMark({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      aria-label="AI Trading Bot — overview"
      className={cn("group flex shrink-0 items-center gap-2.5 rounded-lg outline-offset-4", className)}
    >
      <LogoMark />
      <span className={cn("flex flex-col leading-none", compact && "max-xs:hidden")}>
        <span className="text-[12.5px] font-semibold tracking-[0.14em] whitespace-nowrap text-fg">AI TRADING BOT</span>
        {!compact ? (
          <span className="mt-1 text-[10px] font-medium tracking-[0.08em] whitespace-nowrap text-fg-subtle uppercase">
            Monitoring terminal
          </span>
        ) : null}
      </span>
    </Link>
  );
}
