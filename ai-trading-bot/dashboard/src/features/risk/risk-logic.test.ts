import { describe, expect, it } from "vitest";
import type { RiskMeter } from "@/types";
import { makeRisk } from "@/test/fixtures";
import {
  deriveRiskState,
  effectiveStatus,
  formatCountdown,
  formatMeterValue,
  formatUtilization,
  meterFill,
  meterMessage,
  orderMeters,
  secondsUntil,
  statusFromUtilization,
  statusTone,
  worstStatus,
} from "./risk-logic";

function meter(overrides: Partial<RiskMeter> = {}): RiskMeter {
  return {
    key: "daily_loss",
    label: "Daily loss",
    current: 180,
    limit: 200,
    unit: "usd",
    utilization_pct: 90,
    status: "critical",
    message: "NEAR DAILY LIMIT",
    ...overrides,
  };
}

describe("meter status", () => {
  it("maps utilization to the backend thresholds", () => {
    expect(statusFromUtilization(0)).toBe("ok");
    expect(statusFromUtilization(69.9)).toBe("ok");
    expect(statusFromUtilization(70)).toBe("warning");
    expect(statusFromUtilization(89.9)).toBe("warning");
    expect(statusFromUtilization(90)).toBe("critical");
    expect(statusFromUtilization(100)).toBe("breached");
    expect(statusFromUtilization(125)).toBe("breached");
  });

  it("never shows a calmer status than the utilization implies", () => {
    expect(effectiveStatus(meter({ status: "ok", utilization_pct: 101 }))).toBe("breached");
    expect(effectiveStatus(meter({ status: "breached", utilization_pct: 10 }))).toBe("breached");
  });

  it("maps statuses to tones", () => {
    expect(statusTone("ok")).toBe("accent");
    expect(statusTone("warning")).toBe("warning");
    expect(statusTone("critical")).toBe("down");
    expect(statusTone("breached")).toBe("down");
  });
});

describe("meter text", () => {
  it("formats current / limit by unit", () => {
    expect(formatMeterValue(meter())).toBe("$180 / $200");
    expect(formatMeterValue(meter({ unit: "pct", current: 9.9638, limit: 15 }))).toBe("9.96% / 15%");
    expect(formatMeterValue(meter({ unit: "count", current: 5, limit: 4 }))).toBe("5 / 4");
  });

  it("formats utilization", () => {
    expect(formatUtilization(90)).toBe("90%");
    expect(formatUtilization(125)).toBe("125%");
    expect(formatUtilization(0)).toBe("0%");
    expect(formatUtilization(4.2)).toBe("4.2%");
    expect(formatUtilization(Number.NaN)).toBe("—");
  });

  it("uses the engine message, a fallback when it is missing and nothing when ok", () => {
    expect(meterMessage(meter())).toBe("NEAR DAILY LIMIT");
    expect(meterMessage(meter({ message: null }))).toBe("NEAR LIMIT");
    expect(meterMessage(meter({ status: "ok", utilization_pct: 10, message: null }))).toBeNull();
    expect(meterMessage(meter({ status: "ok", utilization_pct: 120, message: null }))).toBe("LIMIT REACHED");
  });

  it("clamps the fill", () => {
    expect(meterFill(-5)).toBe(0);
    expect(meterFill(66.4)).toBe(66.4);
    expect(meterFill(125)).toBe(100);
    expect(meterFill(Number.NaN)).toBe(0);
  });
});

describe("ordering and overall state", () => {
  const meters = [
    meter({ key: "positions", status: "ok", utilization_pct: 0 }),
    meter({ key: "daily_loss", status: "warning", utilization_pct: 75 }),
    meter({ key: "consecutive_losses", status: "breached", utilization_pct: 125 }),
  ];

  it("keeps the fixed order, or puts the worst first", () => {
    expect(orderMeters(meters).map((m) => m.key)).toEqual(["daily_loss", "positions", "consecutive_losses"]);
    expect(orderMeters(meters, true).map((m) => m.key)).toEqual([
      "consecutive_losses",
      "daily_loss",
      "positions",
    ]);
    expect(worstStatus(meters)).toBe("breached");
    expect(worstStatus([])).toBe("ok");
  });

  it("derives halted / limit / caution / ok", () => {
    expect(deriveRiskState(makeRisk({ trading_allowed: false, meters })).state).toBe("halted");
    expect(deriveRiskState(makeRisk({ meters })).state).toBe("limit");
    expect(deriveRiskState(makeRisk({ meters: meters.slice(0, 2) })).state).toBe("caution");
    expect(deriveRiskState(makeRisk({ meters: meters.slice(0, 1) })).state).toBe("ok");
    expect(deriveRiskState(makeRisk({ meters })).breached.map((m) => m.key)).toEqual(["consecutive_losses"]);
  });
});

describe("halt countdown", () => {
  const now = Date.parse("2026-10-07T10:00:00Z");
  it("counts down to halted_until and ends at null", () => {
    expect(secondsUntil("2026-10-07T13:12:00Z", now)).toBe(3 * 3600 + 12 * 60);
    expect(secondsUntil("2026-10-07T09:00:00Z", now)).toBeNull();
    expect(secondsUntil(null, now)).toBeNull();
  });
  it("formats compactly", () => {
    expect(formatCountdown(3 * 3600 + 12 * 60 + 5)).toBe("3h 12m");
    expect(formatCountdown(12 * 60 + 5)).toBe("12m 05s");
    expect(formatCountdown(45)).toBe("45s");
    expect(formatCountdown(-3)).toBe("0s");
  });
});
