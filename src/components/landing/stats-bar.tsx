import type { LandingStats } from "@/lib/analytics/landing-stats";

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function StatsBar({ stats }: { stats: LandingStats }) {
  const items = [
    { label: "Members", value: formatCount(stats.totalMembers) },
    { label: "Conversations today", value: formatCount(stats.conversationsToday) },
    { label: "Online right now", value: formatCount(stats.onlineNow) },
    { label: "Countries represented", value: formatCount(stats.countriesRepresented) },
  ];

  return (
    <section className="px-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border/60 bg-card/60 px-6 py-6 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <div className="font-display text-2xl font-semibold sm:text-3xl">{item.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
