import { Compass, House } from "lucide-react";
import { Link } from "react-router";
import { NAV_ITEMS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

/** 404 inside the shell: navigation and status stay available. */
export default function NotFoundPage() {
  return (
    <Card className="mx-auto mt-6 max-w-2xl">
      <EmptyState
        size="lg"
        icon={Compass}
        title="Page not found"
        description="This address doesn't match any page of the dashboard. Pick a destination below."
        action={
          <Button asChild variant="primary" size="sm">
            <Link to="/">
              <House aria-hidden /> Back to overview
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-1 border-t border-line p-3 sm:grid-cols-5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            to={item.path}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-dense text-fg-muted transition-colors hover:bg-fg/[0.05] hover:text-fg"
          >
            <item.icon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
