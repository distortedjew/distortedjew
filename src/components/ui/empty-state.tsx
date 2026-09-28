import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon + centered message for an empty list — drop inside an existing CardContent, or use `<Card><CardContent><EmptyState /></CardContent></Card>` for a standalone one. */
export function EmptyState({
  icon: Icon,
  message,
  className,
}: {
  icon: LucideIcon;
  message: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 py-10 text-center", className)}>
      <Icon className="size-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
