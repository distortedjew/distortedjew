import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary/15 text-primary border-primary/20",
        secondary: "bg-secondary/20 text-secondary border-secondary/25",
        outline: "border-border text-foreground bg-transparent",
        success: "bg-success/15 text-success border-success/25",
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
