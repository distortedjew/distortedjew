import { Gauge, ListChecks, Scale } from "lucide-react";
import { useIsMobile } from "@/hooks/use-media-query";
import type { PerformanceReport } from "@/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { MetricsPanel, TradingStatsPanel } from "./StatsPanels";
import { WinLossPanel } from "./WinLossPanel";

interface SectionProps {
  report: PerformanceReport | undefined;
  loading?: boolean;
}

export function WinLossCard({ report, loading }: SectionProps) {
  return (
    <Card>
      <CardHeader title="Win / loss" icon={Scale} subtitle="How often and how big the bot wins and loses" />
      <CardBody>
        <WinLossPanel report={report} loading={loading} />
      </CardBody>
    </Card>
  );
}

export function MetricsCard({ report, loading }: SectionProps) {
  return (
    <Card>
      <CardHeader
        title="Performance metrics"
        icon={Gauge}
        subtitle="Return, risk-adjusted return and drawdown"
      />
      <CardBody>
        <MetricsPanel report={report} loading={loading} />
      </CardBody>
    </Card>
  );
}

export function TradingStatsCard({ report, loading }: SectionProps) {
  return (
    <Card>
      <CardHeader
        title="Trading statistics"
        icon={ListChecks}
        subtitle="Trade counts, holding time and streaks"
      />
      <CardBody>
        <TradingStatsPanel report={report} loading={loading} />
      </CardBody>
    </Card>
  );
}

/**
 * Win/loss, metrics and statistics. On phones they share one card with tabs (a reorganisation, not
 * three long stacks); from `sm` up they are separate cards in the page grid.
 */
export function StatSections({ report, loading }: SectionProps) {
  const mobile = useIsMobile();
  if (!mobile) return null;
  return (
    <Card>
      <Tabs defaultValue="metrics">
        <div className="px-4 pt-3.5">
          <TabsList variant="pills" className="w-full [&>*]:flex-1">
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="winloss">Win / loss</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
          </TabsList>
        </div>
        <CardBody className="pt-3">
          <TabsContent value="metrics">
            <MetricsPanel report={report} loading={loading} />
          </TabsContent>
          <TabsContent value="winloss">
            <WinLossPanel report={report} loading={loading} />
          </TabsContent>
          <TabsContent value="stats">
            <TradingStatsPanel report={report} loading={loading} />
          </TabsContent>
        </CardBody>
      </Tabs>
    </Card>
  );
}
