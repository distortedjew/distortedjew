import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";

const iconButtonStyles = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center rounded-lg transition-[background-color,color,border-color] duration-150",
    "disabled:pointer-events-none disabled:opacity-45",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70",
  ],
  {
    variants: {
      variant: {
        ghost: "text-fg-muted hover:bg-fg/[0.07] hover:text-fg data-[state=open]:bg-fg/[0.07] data-[state=open]:text-fg",
        secondary:
          "border border-line-strong bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg data-[state=open]:bg-surface-3",
        outline: "border border-line-strong text-fg-muted hover:bg-fg/[0.04] hover:text-fg",
        primary: "bg-accent-solid text-accent-fg hover:bg-accent-solid-hover",
      },
      size: {
        xs: "size-6 [&_svg]:size-3.5",
        sm: "size-8 [&_svg]:size-4",
        md: "size-9 [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "ghost", size: "sm" },
  },
);

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">, VariantProps<typeof iconButtonStyles> {
  icon: LucideIcon;
  /** Accessible name; also shown as a tooltip unless `tooltip={false}`. */
  label: string;
  tooltip?: boolean | ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  loading?: boolean;
  /** Small overlay (e.g. an unread-count badge). */
  badge?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/** Square icon-only button with an accessible label and tooltip. */
export function IconButton({
  icon: Icon,
  label,
  tooltip = true,
  tooltipSide = "bottom",
  loading,
  badge,
  variant,
  size,
  className,
  type,
  disabled,
  ref,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      disabled={disabled || loading}
      className={cn(iconButtonStyles({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner /> : <Icon aria-hidden />}
      {badge}
    </button>
  );
  if (tooltip === false) return button;
  return (
    <Tooltip content={tooltip === true ? label : tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
