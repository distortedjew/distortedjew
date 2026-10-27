import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Right side: primary actions, range selectors. Wraps under the title on phones. */
  actions?: ReactNode;
  /** Small inline status after the title (LIVE dot, counts, "Updated 2s ago"). */
  meta?: ReactNode;
  className?: string;
}

/** Top of every page: title, one-line description, actions. */
export function PageHeader({ title, description, icon: Icon, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted ring-1 ring-line ring-inset sm:flex">
            <Icon className="size-[18px]" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.02em] text-fg">{title}</h1>
            {meta}
          </div>
          {description ? <p className="mt-0.5 text-dense text-fg-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </header>
  );
}

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  info?: ReactNode;
  /** Count shown after the title. */
  count?: number;
  actions?: ReactNode;
  className?: string;
}

/** 11px uppercase label that groups content inside a page or card. */
export function SectionHeader({ title, description, info, count, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-2.5 flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="label-caps">{title}</h2>
          {count !== undefined ? (
            <span className="rounded bg-fg/[0.06] px-1 num text-2xs text-fg-subtle">{count}</span>
          ) : null}
          {info ? <InfoTooltip content={info} /> : null}
        </div>
        {description ? <p className="mt-0.5 text-xs text-fg-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
