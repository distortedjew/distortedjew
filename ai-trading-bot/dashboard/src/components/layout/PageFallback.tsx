import { Skeleton, SkeletonCard, SkeletonChart } from "@/components/ui/Skeleton";

/** Route-level Suspense fallback: page header + a plausible card layout (no spinner flash). */
export function PageFallback() {
  return (
    <div aria-busy="true" aria-label="Loading page" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl surface-card p-4 lg:col-span-2">
          <Skeleton className="mb-4 h-4 w-36" />
          <SkeletonChart height={280} />
        </div>
        <SkeletonCard lines={6} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard className="hidden lg:block" />
      </div>
    </div>
  );
}
