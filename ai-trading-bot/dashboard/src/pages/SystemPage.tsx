import { useSystem } from "@/hooks/queries";
import { navItem } from "@/lib/constants";
import { HEALTH_STATE_META } from "@/lib/constants";
import { LiveTag } from "@/components/layout/LiveTag";
import { Badge, PageHeader, SectionHeader } from "@/components/ui";
import {
  DatabaseCard,
  EventStream,
  HealthGrid,
  HeartbeatCard,
  RecentIssuesCard,
  ResourcesCard,
  WebSocketCard,
} from "@/features/system";
import { overallHealth } from "@/features/system/health-meta";

export default function SystemPage() {
  const nav = navItem("system");
  const q = useSystem();
  const panel = { system: q.data, isPending: q.isPending, error: q.error, onRetry: () => void q.refetch() };
  const overall = q.data ? overallHealth(q.data.components.map((c) => c.state)) : null;
  const problems = q.data?.components.filter((c) => c.state === "error" || c.state === "warning").length ?? 0;

  return (
    <>
      <PageHeader title={nav.label} description={nav.description} icon={nav.icon} meta={<LiveTag />} />
      <div className="space-y-4">
        <HeartbeatCard system={q.data} />

        <section aria-labelledby="components-heading">
          <SectionHeader
            title={<span id="components-heading">Components</span>}
            info="🟢 Operational · 🟡 Warning · 🔴 Error · grey = not configured (intentionally off, never an error). Refreshed every 5 seconds."
            actions={
              overall ? (
                <Badge tone={HEALTH_STATE_META[overall].tone} icon={HEALTH_STATE_META[overall].icon} size="sm">
                  {problems === 0 ? "All systems operational" : `${problems} need${problems === 1 ? "s" : ""} attention`}
                </Badge>
              ) : null
            }
          />
          <HealthGrid {...panel} />
        </section>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <ResourcesCard {...panel} />
          </div>
          <div className="min-w-0">
            <RecentIssuesCard {...panel} />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <EventStream />
          </div>
          <div className="min-w-0 space-y-4">
            <WebSocketCard system={q.data} />
            <DatabaseCard {...panel} />
          </div>
        </div>
      </div>
    </>
  );
}
