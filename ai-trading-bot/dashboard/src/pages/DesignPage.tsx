import { Palette } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ChartsSection,
  FeedbackSection,
  FormsSection,
  KpiSection,
  NumbersSection,
  OverlaysSection,
  SparklineSection,
  TableSection,
} from "@/pages/design/ComponentSections";
import {
  BadgesSection,
  ButtonsSection,
  ColorsSection,
  StatusSection,
  TypographySection,
} from "@/pages/design/FoundationSections";

const INDEX = [
  ["colors", "Colors"],
  ["type", "Type"],
  ["status", "Status"],
  ["buttons", "Buttons"],
  ["badges", "Badges"],
  ["forms", "Forms"],
  ["numbers", "Numbers"],
  ["kpis", "KPIs"],
  ["sparklines", "Sparklines"],
  ["charts", "Charts"],
  ["table", "Table"],
  ["feedback", "States"],
  ["overlays", "Overlays"],
] as const;

/** Dev-only visual QA page for every primitive (route /_design, absent from production builds). */
export default function DesignPage() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="space-y-10 pb-10">
      <PageHeader
        title="Design system"
        icon={Palette}
        meta={<Badge tone="warning">dev only</Badge>}
        description="“Quiet terminal”: calm, information-dense, color carries meaning. Static sample data lives only on this page."
        actions={
          <Button size="sm" onClick={toggleTheme}>
            Switch to {theme === "dark" ? "light" : "dark"}
          </Button>
        }
      />
      <nav aria-label="Sections" className="scrollbar-none -mt-6 flex gap-1 overflow-x-auto">
        {INDEX.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="shrink-0 rounded-md px-2.5 py-1 text-xs text-fg-subtle transition-colors hover:bg-fg/[0.05] hover:text-fg"
          >
            {label}
          </a>
        ))}
      </nav>
      <ColorsSection />
      <TypographySection />
      <StatusSection />
      <ButtonsSection />
      <BadgesSection />
      <FormsSection />
      <NumbersSection />
      <KpiSection />
      <SparklineSection />
      <ChartsSection />
      <TableSection />
      <FeedbackSection />
      <OverlaysSection />
    </div>
  );
}
