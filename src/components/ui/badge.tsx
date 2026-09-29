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
        default: "bg-accent text-accent-foreground border-transparent",
        secondary: "bg-secondary text-secondary-foreground border-transparent",
        outline: "border-border text-foreground bg-transparent",
        success: "bg-glow/20 text-success-foreground border-transparent",
        destructive: "bg-destructive/12 text-destructive border-transparent",
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
