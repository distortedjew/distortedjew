import { describe, expect, it } from "vitest";
import { makePosition } from "@/test/fixtures";
import { openSeconds, positionTotals, riskBreakdown, sltpGeometry } from "./position-math";

describe("sltpGeometry", () => {
  it("maps a long between its stop (0) and target (100)", () => {
    const g = sltpGeometry(100, 90, 120, 105);
    expect(g?.entryPct).toBeCloseTo(33.33, 1);
    expect(g?.currentPct).toBeCloseTo(50, 5);
    expect(g?.beyond).toBeNull();
  });

  it("maps a short the same way (stop above target)", () => {
    const g = sltpGeometry(100, 110, 80, 95);
    expect(g?.entryPct).toBeCloseTo(33.33, 1);
    expect(g?.currentPct).toBeCloseTo(50, 5);
  });

  it("clamps and flags prices beyond the levels", () => {
    expect(sltpGeometry(100, 90, 120, 85)).toMatchObject({ currentPct: 0, beyond: "stop" });
    expect(sltpGeometry(100, 90, 120, 130)).toMatchObject({ currentPct: 100, beyond: "target" });
  });

  it("returns null when there is nothing to draw", () => {
    expect(sltpGeometry(100, 100, 100, 100)).toBeNull();
    expect(sltpGeometry(Number.NaN, 90, 120, 100)).toBeNull();
  });
});

describe("riskBreakdown", () => {
  it("derives the stop distance, reward:risk and the size that risks exactly risk_amount", () => {
    const b = riskBreakdown(
      makePosition({
        side: "LONG",
        size: 0.5,
        entry_price: 100,
        stop_loss: 98,
        take_profit: 104,
        risk_amount: 1,
        risk_pct: 0.5,
      }),
    );
    expect(b.stopDistance).toBe(2);
    expect(b.stopDistancePct).toBeCloseTo(2);
    expect(b.rewardRisk).toBe(2);
    expect(b.sizeFromRisk).toBeCloseTo(0.5);
    expect(b.capped).toBe(false);
    expect(b.equityAtEntry).toBeCloseTo(200);
    expect(b.lossAtStop).toBeCloseTo(1);
    expect(b.gainAtTarget).toBeCloseTo(2);
  });

  it("flags a size capped below the risk-derived size", () => {
    const b = riskBreakdown(
      makePosition({ size: 0.2, entry_price: 100, stop_loss: 98, take_profit: 104, risk_amount: 1 }),
    );
    expect(b.capped).toBe(true);
  });
});

describe("positionTotals", () => {
  it("sums exposure, P&L and risk and averages confidence ignoring missing values", () => {
    const t = positionTotals([
      makePosition({
        size: 1,
        current_price: 100,
        unrealized_pnl: 5,
        risk_amount: 2,
        risk_pct: 0.2,
        ai_confidence: 80,
      }),
      makePosition({
        id: "b",
        side: "SHORT",
        size: 2,
        current_price: 50,
        unrealized_pnl: -3,
        risk_amount: 1,
        risk_pct: 0.1,
        ai_confidence: null,
      }),
    ]);
    expect(t).toMatchObject({
      count: 2,
      exposure: 200,
      unrealizedPnl: 2,
      openRisk: 3,
      avgConfidence: 80,
      longs: 1,
      shorts: 1,
    });
    expect(t.openRiskPct).toBeCloseTo(0.3);
    expect(positionTotals([]).avgConfidence).toBeNull();
  });
});

describe("openSeconds", () => {
  it("counts from opened_at and falls back on bad input", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(openSeconds("2026-10-04T11:30:00Z", now, 0)).toBe(1_800);
    expect(openSeconds("garbage", now, 42)).toBe(42);
    expect(openSeconds("2026-10-04T13:00:00Z", now, 0)).toBe(0);
  });
});
