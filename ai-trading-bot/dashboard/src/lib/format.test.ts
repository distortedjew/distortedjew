import { describe, expect, it } from "vitest";
import {
  DASH,
  formatAgo,
  formatBps,
  formatCompact,
  formatDate,
  formatDayLabel,
  formatDuration,
  formatInt,
  formatMb,
  formatMs,
  formatNumber,
  formatPct,
  formatPnl,
  formatPrice,
  formatR,
  formatRatio,
  formatRelativeTime,
  formatSignedPct,
  formatSize,
  formatTime,
  formatUsd,
  formatUtc,
  priceDecimals,
  signOf,
  splitSymbol,
  toneOf,
} from "@/lib/format";
import { secondsSince, toMs } from "@/lib/time";

describe("missing values", () => {
  it("renders an em dash for null, undefined and NaN", () => {
    for (const fn of [
      formatPrice,
      formatUsd,
      formatPnl,
      formatPct,
      formatCompact,
      formatRatio,
      formatR,
      formatSize,
    ]) {
      expect(fn(null)).toBe(DASH);
      expect(fn(undefined)).toBe(DASH);
      expect(fn(Number.NaN)).toBe(DASH);
    }
  });
});

describe("prices", () => {
  it("adapts decimals to the magnitude", () => {
    expect(priceDecimals(97_123.45)).toBe(2);
    expect(priceDecimals(2.5)).toBe(4);
    expect(priceDecimals(0.0123)).toBe(5);
    expect(formatPrice(97_123.456)).toBe("97,123.46");
    expect(formatPrice(165.2)).toBe("165.20");
    expect(formatPrice(2.34567)).toBe("2.3457");
    expect(formatPrice(0.0123456)).toBe("0.01235");
    expect(formatPrice(0.00001234)).toBe("0.00001234");
  });

  it("uses the typographic minus and optional currency", () => {
    expect(formatPrice(-1.5)).toBe("−1.5000");
    expect(formatPrice(97_000, { currency: true })).toBe("$97,000.00");
    expect(formatPrice(1.23456, { decimals: 2 })).toBe("1.23");
  });
});

describe("money and P&L", () => {
  it("formats USD amounts", () => {
    expect(formatUsd(10_482.31)).toBe("$10,482.31");
    expect(formatUsd(-120.5)).toBe("−$120.50");
    expect(formatUsd(10_482.31, { compact: true })).toBe("$10.5K");
    expect(formatUsd(2_500_000, { compact: true })).toBe("$2.5M");
    expect(formatUsd(950, { compact: true })).toBe("$950.00");
  });

  it("signs P&L and never shows a negative zero", () => {
    expect(formatPnl(482.31)).toBe("+$482.31");
    expect(formatPnl(-120.5)).toBe("−$120.50");
    expect(formatPnl(0)).toBe("$0.00");
    expect(formatPnl(-0.001)).toBe("$0.00");
    expect(formatPnl(1_234.5, { compact: true })).toBe("+$1.23K");
  });
});

describe("percent (inputs are already in percent units)", () => {
  it("never multiplies by 100", () => {
    expect(formatPct(4.82)).toBe("4.82%");
    expect(formatPct(0.5)).toBe("0.50%");
    expect(formatPct(65, { decimals: 0 })).toBe("65%");
  });

  it("signs deltas on request", () => {
    expect(formatPct(4.8234, { signed: true })).toBe("+4.82%");
    expect(formatPct(-1.2, { signed: true })).toBe("−1.20%");
    expect(formatSignedPct(0)).toBe("0.00%");
    expect(formatSignedPct(-0.004)).toBe("0.00%");
  });
});

describe("numbers, ratios and sizes", () => {
  it("formats plain numbers and integers", () => {
    expect(formatNumber(1_234.567)).toBe("1,234.57");
    expect(formatNumber(-0.0001)).toBe("0.00");
    expect(formatNumber(3, 1, { signed: true })).toBe("+3.0");
    expect(formatInt(1_234.4)).toBe("1,234");
    expect(formatInt(-2, { signed: true })).toBe("−2");
  });

  it("compacts large magnitudes", () => {
    expect(formatCompact(1_234)).toBe("1.23K");
    expect(formatCompact(3_400_000)).toBe("3.4M");
    expect(formatCompact(12_345_678_901)).toBe("12.3B");
    expect(formatCompact(999.6)).toBe("1K");
    expect(formatCompact(12.3456)).toBe("12.35");
    expect(formatCompact(-45_000, { signed: true })).toBe("−45K");
  });

  it("formats ratios and R multiples", () => {
    expect(formatRatio(1.8512)).toBe("1.85");
    expect(formatRatio(Infinity)).toBe("∞");
    expect(formatR(1.2)).toBe("+1.20R");
    expect(formatR(-0.8)).toBe("−0.80R");
  });

  it("formats crypto sizes with adaptive precision", () => {
    expect(formatSize(0.0123, "BTC")).toBe("0.0123 BTC");
    expect(formatSize(0.000456789)).toBe("0.0004568");
    expect(formatSize(12.5, "SOL")).toBe("12.5 SOL");
    expect(formatSize(1_500)).toBe("1,500");
  });

  it("formats units", () => {
    expect(formatBps(5)).toBe("5 bps");
    expect(formatBps(2.5)).toBe("2.5 bps");
    expect(formatMs(245)).toBe("245 ms");
    expect(formatMs(1_240)).toBe("1.24 s");
    expect(formatMb(512)).toBe("512 MB");
    expect(formatMb(1_536)).toBe("1.5 GB");
  });
});

describe("durations and times", () => {
  it("formats durations from seconds", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(725)).toBe("12m 5s");
    expect(formatDuration(8_040)).toBe("2h 14m");
    expect(formatDuration(273_600)).toBe("3d 4h");
    expect(formatDuration(-5)).toBe("0s");
  });

  it("formats ages", () => {
    expect(formatAgo(0.4)).toBe("now");
    expect(formatAgo(0.4, "long")).toBe("just now");
    expect(formatAgo(2, "long")).toBe("2 seconds ago");
    expect(formatAgo(1, "long")).toBe("1 second ago");
    expect(formatAgo(125)).toBe("2m ago");
    expect(formatAgo(3 * 3_600, "long")).toBe("3 hours ago");
    expect(formatAgo(-12)).toBe("in 12s");
  });

  it("formats relative times against a fixed now", () => {
    const now = Date.parse("2026-10-04T12:00:30Z");
    expect(formatRelativeTime("2026-10-04T12:00:00Z", now)).toBe("30s ago");
    expect(formatRelativeTime("2026-10-04T09:00:30Z", now, "long")).toBe("3 hours ago");
    // Older than a week: an absolute date.
    expect(formatRelativeTime("2026-09-01T12:00:00Z", now)).toBe("Sep 1");
  });

  it("formats local and UTC timestamps (tests run with TZ=UTC)", () => {
    expect(formatTime("2026-10-04T14:32:05Z")).toBe("14:32:05");
    expect(formatTime("2026-10-04T14:32:05Z", { seconds: false })).toBe("14:32");
    expect(formatDate("2026-10-04T14:32:05Z", Date.parse("2026-12-01T00:00:00Z"))).toBe("Oct 4");
    expect(formatDate("2025-10-04T14:32:05Z", Date.parse("2026-12-01T00:00:00Z"))).toBe("Oct 4, 2025");
    expect(formatUtc("2026-10-04T12:32:05Z")).toBe("2026-10-04 12:32:05 UTC");
    expect(formatUtc(1_791_117_125)).toBe("2026-10-04 12:32:05 UTC");
  });

  it("labels day groups", () => {
    const now = Date.parse("2026-10-04T15:00:00Z");
    expect(formatDayLabel("2026-10-04T01:00:00Z", now)).toBe("Today");
    expect(formatDayLabel("2026-10-03T23:00:00Z", now)).toBe("Yesterday");
    expect(formatDayLabel("2026-10-01T10:00:00Z", now)).toBe("Oct 1");
  });

  it("parses API times: ISO strings, unix seconds and ms", () => {
    expect(toMs("2026-10-04T12:00:00Z")).toBe(Date.parse("2026-10-04T12:00:00Z"));
    expect(toMs(1_791_115_200)).toBe(1_791_115_200_000);
    expect(toMs(1_791_115_200_000)).toBe(1_791_115_200_000);
    expect(toMs("not a date")).toBeNull();
    expect(secondsSince("2026-10-04T12:00:00Z", Date.parse("2026-10-04T12:00:05Z"))).toBe(5);
  });
});

describe("signs and tones", () => {
  it("derives the tone from the sign at display precision", () => {
    expect(signOf(0.004)).toBe(0);
    expect(signOf(-3)).toBe(-1);
    expect(toneOf(5)).toBe("up");
    expect(toneOf(-5)).toBe("down");
    expect(toneOf(0.001)).toBe("neutral");
    expect(toneOf(null)).toBe("neutral");
    expect(toneOf(-5, { invert: true })).toBe("up");
  });

  it("splits symbols", () => {
    expect(splitSymbol("BTC/USDT")).toEqual({ base: "BTC", quote: "USDT" });
  });
});
