import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { InfoTooltip } from "@/components/ui/InfoTooltip";

type CardVariant = "default" | "glass" | "inset" | "outline" | "ghost";

const variants: Record<CardVariant, string> = {
  /** Lifted panel: the default container for every widget. */
  default: "surface-card",
  /** Soft glass for sticky / overlay surfaces. */
  glass: "surface-glass border border-line shadow-card",
  /** Recessed sub-panel inside a card. */
  inset: "bg-surface-2/70 border border-line-subtle",
  outline: "border border-line",
  ghost: "",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /** Hover affordance for clickable cards. */
  interactive?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Card container. Compose with CardHeader / CardBody / CardFooter:
 *
 *   <Card>
 *     <CardHeader title="Open positions" subtitle="3 open · $4,210 exposure" actions={<Button size="xs">All</Button>} />
 *     <CardBody>…</CardBody>
 *   </Card>
 */
export function Card({ variant = "default", interactive, className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative min-w-0 rounded-xl",
        variants[variant],
        interactive &&
          "cursor-pointer transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-surface-2/60",
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** Explanation shown in an ⓘ tooltip next to the title. */
  info?: ReactNode;
  /** Right-aligned controls (buttons, segmented controls, badges). */
  actions?: ReactNode;
  /** Small element right after the title (count badge, LIVE dot). */
  badge?: ReactNode;
  /** Remove the bottom hairline. */
  borderless?: boolean;
}

export function CardHeader({
  title,
  subtitle,
  icon: Icon,
  info,
  actions,
  badge,
  borderless = true,
  className,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-start justify-between gap-3 px-4 pt-3.5 pb-2",
        !borderless && "border-b border-line pb-3",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-fg/[0.05] text-fg-muted ring-1 ring-line ring-inset">
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-[13.5px] leading-6 font-semibold tracking-[-0.005em] text-fg">
              {title}
            </h3>
            {info ? <InfoTooltip content={info} /> : null}
            {badge}
          </div>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-fg-subtle">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}
