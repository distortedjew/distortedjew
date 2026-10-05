import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Spinner";

const buttonStyles = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium",
    "transition-[background-color,border-color,color,box-shadow,opacity] duration-150",
    "disabled:pointer-events-none disabled:opacity-45",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-accent-solid text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.25)] hover:bg-accent-solid-hover",
        secondary:
          "border border-line-strong bg-surface-2 text-fg shadow-[0_1px_2px_rgb(0_0_0/0.06)] hover:border-fg/20 hover:bg-surface-3",
        outline: "border border-line-strong text-fg hover:border-fg/20 hover:bg-fg/[0.04]",
        ghost: "text-fg-muted hover:bg-fg/[0.06] hover:text-fg",
        danger:
          "bg-down-solid text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.25)] hover:brightness-110",
        "danger-ghost": "text-down hover:bg-down/10",
        link: "h-auto px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 px-2 text-xs [&_svg]:size-3.5",
        sm: "h-8 px-2.5 text-dense [&_svg]:size-3.5",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-10 px-4 text-sm [&_svg]:size-4",
      },
      fullWidth: { true: "w-full" },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  /** Render the child element (e.g. a router <Link>) with button styles. */
  asChild?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Button. Variants: primary (one per view), secondary (default), outline, ghost, danger,
 * danger-ghost, link. Sizes xs · sm · md · lg.
 *
 *   <Button variant="primary" leftIcon={Play} loading={run.isPending}>Run backtest</Button>
 *   <Button asChild variant="ghost"><Link to="/trades">All trades</Link></Button>
 */
export function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild,
  loading,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  disabled,
  children,
  type,
  ref,
  ...props
}: ButtonProps) {
  const classes = cn(buttonStyles({ variant, size, fullWidth }), className);
  if (asChild) {
    return (
      <Slot className={classes} ref={ref} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-[1em]" /> : LeftIcon ? <LeftIcon aria-hidden /> : null}
      {children as ReactNode}
      {RightIcon && !loading ? <RightIcon aria-hidden /> : null}
    </button>
  );
}
