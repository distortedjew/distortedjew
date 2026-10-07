import { Link } from "react-router";
import { Settings2 } from "lucide-react";
import { useSettings } from "@/hooks/queries";
import type { RiskSnapshot } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { Skeleton } from "@/components/ui/Skeleton";
import { limitRows } from "./risk-logic";

/** The configured limits (read-only here; edited under Settings → Risk). */
export function LimitsCard({ risk, loading }: { risk: RiskSnapshot | undefined; loading?: boolean }) {
  const settings = useSettings();
  const risk_settings = settings.data?.settings.risk;
  return (
    <Card>
      <CardHeader title="Configured limits" icon={Settings2} subtitle="What the risk manager enforces" />
      <CardBody>
        {loading || !risk ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : (
          <dl className="divide-y divide-line-subtle">
            {limitRows(risk, risk_settings).map((row) => (
              <KeyValue
                key={row.label}
                orientation="horizontal"
                label={row.label}
                info={row.info}
                value={row.value}
              />
            ))}
          </dl>
        )}
      </CardBody>
      <CardFooter>
        <span>Read-only here. The dashboard never controls trading.</span>
        <Button asChild variant="link" size="xs" className="text-xs">
          <Link to="/settings?tab=risk">Edit in Settings</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
