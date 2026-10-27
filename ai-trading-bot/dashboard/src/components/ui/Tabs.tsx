import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Tabs (Radix). `variant="underline"` (default) for page sections, `"pills"` inside cards.
 *
 *   <Tabs defaultValue="overview">
 *     <TabsList><TabsTrigger value="overview">Overview</TabsTrigger>…</TabsList>
 *     <TabsContent value="overview">…</TabsContent>
 *   </Tabs>
 */
export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  variant = "underline",
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & { variant?: "underline" | "pills" }) {
  return (
    <TabsPrimitive.List
      data-variant={variant}
      className={cn(
        "group/tabs flex items-center",
        variant === "underline"
          ? "scrollbar-none gap-1 overflow-x-auto border-b border-line"
          : "inline-flex gap-0.5 rounded-lg bg-surface-2 p-0.5 ring-1 ring-line ring-inset",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-dense font-medium whitespace-nowrap text-fg-subtle transition-colors",
        "hover:text-fg-muted disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5",
        // underline variant
        "group-data-[variant=underline]/tabs:-mb-px group-data-[variant=underline]/tabs:h-9 group-data-[variant=underline]/tabs:border-b-2 group-data-[variant=underline]/tabs:border-transparent group-data-[variant=underline]/tabs:px-2.5",
        "group-data-[variant=underline]/tabs:data-[state=active]:border-accent group-data-[variant=underline]/tabs:data-[state=active]:text-fg",
        // pills variant
        "group-data-[variant=pills]/tabs:h-7 group-data-[variant=pills]/tabs:rounded-md group-data-[variant=pills]/tabs:px-2.5 group-data-[variant=pills]/tabs:text-xs",
        "group-data-[variant=pills]/tabs:data-[state=active]:bg-surface group-data-[variant=pills]/tabs:data-[state=active]:text-fg group-data-[variant=pills]/tabs:data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_var(--line)] dark:group-data-[variant=pills]/tabs:data-[state=active]:bg-surface-3",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}
