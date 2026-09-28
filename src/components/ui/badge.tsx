import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        // primary/secondary/success are light pastels: the tinted badge
        // background stays close to the page background in light mode (so
        // the accent color itself is unreadable as text) but composites
        // much darker in dark mode (so the accent color reads fine there,
        // same as before) — hence the dark: overrides rather than one color.
        default: "bg-primary/15 text-primary-foreground border-primary/20 dark:text-primary",
        secondary: "bg-secondary/20 text-secondary-foreground border-secondary/25 dark:text-secondary",
        outline: "border-border text-foreground bg-transparent",
        success: "bg-success/15 text-success-foreground border-success/25 dark:text-success",
        destructive: "bg-destructive/15 text-destructive border-destructive/25",
        muted: "bg-muted text-muted-foreground border-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
