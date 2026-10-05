import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One left-aligned row of filters above the content it scopes (date range first).
 * Wraps on small screens; put secondary controls after <FilterBarSpacer />.
 *
 *   <FilterBar>
 *     <SegmentedControl … />  <Select … />  <FilterBarSpacer />  <Button size="sm">Export</Button>
 *   </FilterBar>
 */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function FilterBarSpacer() {
  return <div className="hidden flex-1 sm:block" aria-hidden />;
}
