import { House, RotateCw } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import NotFoundPage from "@/pages/NotFoundPage";

function isChunkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /dynamically imported module|Failed to fetch dynamically|Importing a module script failed|ChunkLoadError/i.test(
      error.message,
    )
  );
}

/**
 * Per-route error boundary: the page area shows a friendly error while the navigation, status
 * and mode badge keep working.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  const chunk = isChunkError(error);
  const message = chunk
    ? "A newer version of the dashboard is available. Reload to continue."
    : "This part of the dashboard crashed while rendering. The rest of the app is still running — reload to try again.";

  return (
    <Card className="mx-auto mt-6 max-w-xl">
      <ErrorState title={chunk ? "Dashboard updated" : "Something went wrong on this page"} description={message} />
      <div className="flex flex-wrap items-center justify-center gap-2 px-6 pb-8">
        <Button variant="primary" size="sm" leftIcon={RotateCw} onClick={() => window.location.reload()}>
          Reload page
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <House aria-hidden /> Back to overview
          </Link>
        </Button>
      </div>
      {import.meta.env.DEV && error instanceof Error ? (
        <pre className="mx-6 mb-6 max-h-56 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-4 text-fg-subtle">
          {error.stack ?? error.message}
        </pre>
      ) : null}
    </Card>
  );
}
