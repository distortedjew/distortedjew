import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { KpiCard } from "@/features/overview/KpiCard";
import { KPI_DEFINITIONS, KPI_ORDER, sparkLabels } from "@/features/overview/kpi-definitions";
import { makeKpi } from "@/test/fixtures";

function renderCard(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("KpiCard", () => {
  it("shows the label, value, change vs the previous period and its comparison label", () => {
    renderCard(<KpiCard definition={KPI_DEFINITIONS.equity} kpi={makeKpi()} />);
    const card = screen.getByRole("region", { name: "Portfolio equity" });
    expect(within(card).getByText("Portfolio equity")).toBeInTheDocument();
    // The animated value is written to the DOM directly; the sr-only copy carries the final value.
    expect(within(card).getAllByText("$10,482.31").length).toBeGreaterThan(0);
    expect(within(card).getByText("+$182.31")).toBeInTheDocument();
    expect(within(card).getByText("+1.77%")).toBeInTheDocument();
    expect(within(card).getByText("up")).toBeInTheDocument(); // ▲ announced for screen readers
    expect(within(card).getByText("vs 24h ago")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "About Portfolio equity" })).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: /Equity over the last 24 hours/ })).toBeInTheDocument();
  });

  it("colors signed P&L values and prints the percent suffix", () => {
    renderCard(
      <KpiCard
        definition={KPI_DEFINITIONS.today_pnl}
        kpi={makeKpi({ value: -42.5, change: -60, change_pct: null, comparison_label: "vs yesterday" })}
        valueSuffix="−0.41%"
      />,
    );
    const card = screen.getByRole("region", { name: "Today's P&L" });
    const values = within(card).getAllByText("−$42.50");
    expect(values.some((el) => el.closest(".text-down"))).toBe(true);
    expect(within(card).getByText("−0.41%")).toBeInTheDocument();
    expect(within(card).getByText("−$60.00")).toBeInTheDocument();
    expect(within(card).getByText("down")).toBeInTheDocument();
  });

  it("renders a missing value as an em dash", () => {
    renderCard(
      <KpiCard
        definition={KPI_DEFINITIONS.profit_factor}
        kpi={makeKpi({ value: null, previous: null, change: null, change_pct: null, sparkline: [] })}
        nullHint="No losing trades in the last 7 days yet."
      />,
    );
    const card = screen.getByRole("region", { name: "Profit factor" });
    expect(within(card).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows a skeleton while the first load is pending", () => {
    renderCard(<KpiCard definition={KPI_DEFINITIONS.win_rate} kpi={undefined} loading />);
    expect(screen.getByLabelText("Win rate loading")).toHaveAttribute("aria-busy", "true");
  });
});

describe("KPI definitions", () => {
  it("cover all eight KPIs in display order", () => {
    expect(KPI_ORDER).toEqual([
      "equity",
      "today_pnl",
      "total_pnl",
      "win_rate",
      "profit_factor",
      "max_drawdown",
      "open_positions",
      "trades_today",
    ]);
    for (const key of KPI_ORDER) expect(KPI_DEFINITIONS[key].description.length).toBeGreaterThan(20);
  });

  it("labels sparkline points back from the snapshot time", () => {
    const asOf = Date.parse("2026-10-04T15:00:00Z");
    expect(sparkLabels(KPI_DEFINITIONS.today_pnl, 3, asOf)).toEqual(["Oct 2", "Oct 3", "Today"]);
    expect(sparkLabels(KPI_DEFINITIONS.open_positions, 3, asOf)).toEqual(["13:00", "14:00", "Now"]);
    expect(sparkLabels(KPI_DEFINITIONS.equity, 2, asOf)).toEqual(["14:30", "Now"]);
    // Days without trades are skipped by the API, so these have no fixed step.
    expect(sparkLabels(KPI_DEFINITIONS.win_rate, 5, asOf)).toBeUndefined();
  });
});
