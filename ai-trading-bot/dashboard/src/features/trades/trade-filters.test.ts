import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyViewPatch,
  filtersToApi,
  sortStateFromView,
  sortStateToView,
  viewFromParams,
  viewToApi,
} from "./trade-filters";

const parse = (qs: string) => viewFromParams(new URLSearchParams(qs));

describe("viewFromParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parse("")).toMatchObject({ sort: "closed_at", order: "desc", offset: 0 });
    expect(activeFilterCount(parse(""))).toBe(0);
  });

  it("reads every filter", () => {
    const v = parse(
      "symbol=BTC%2FUSDT&side=SHORT&result=LOSS&strategy=hybrid&exit=STOP_LOSS&minconf=60&maxconf=90&from=2026-10-01&to=2026-10-04&q=pullback&sort=pnl&order=asc&offset=50",
    );
    expect(v).toEqual({
      symbol: "BTC/USDT",
      side: "SHORT",
      result: "LOSS",
      strategy: "hybrid",
      exit: "STOP_LOSS",
      minConf: 60,
      maxConf: 90,
      from: "2026-10-01",
      to: "2026-10-04",
      q: "pullback",
      sort: "pnl",
      order: "asc",
      offset: 50,
    });
    expect(activeFilterCount(v)).toBe(8);
  });

  it("ignores invalid values from a hand-edited URL", () => {
    const v = parse("side=UP&result=maybe&minconf=abc&from=yesterday&sort=banana&order=sideways&offset=-5");
    expect(v).toMatchObject({ sort: "closed_at", order: "desc", offset: 0 });
    expect(v.side).toBeUndefined();
    expect(v.result).toBeUndefined();
    expect(v.minConf).toBeUndefined();
    expect(v.from).toBeUndefined();
  });

  it("clamps confidence to 0-100", () => {
    expect(parse("minconf=-20&maxconf=250")).toMatchObject({ minConf: 0, maxConf: 100 });
  });
});

describe("applyViewPatch", () => {
  it("writes values, drops defaults and keeps unrelated params", () => {
    const next = applyViewPatch(new URLSearchParams("trade=pos_1&sort=pnl"), {
      side: "LONG",
      sort: "closed_at",
    });
    expect(next.toString()).toBe("trade=pos_1&side=LONG");
  });

  it("returns to the first page when a filter changes, but not when only the page changes", () => {
    const base = new URLSearchParams("side=LONG&offset=50");
    expect(applyViewPatch(base, { result: "WIN" }).has("offset")).toBe(false);
    expect(applyViewPatch(base, { offset: 75 }).get("offset")).toBe("75");
    expect(applyViewPatch(base, { offset: 0 }).has("offset")).toBe(false);
  });

  it("clears a filter with undefined", () => {
    expect(applyViewPatch(new URLSearchParams("q=abc"), { q: undefined }).toString()).toBe("");
  });
});

describe("API mapping", () => {
  it("maps names, closes the end day and omits open-ended confidence bounds", () => {
    const api = filtersToApi(
      parse("exit=TAKE_PROFIT&minconf=0&maxconf=100&from=2026-10-01&to=2026-10-04&symbol=ETH%2FUSDT"),
    );
    expect(api).toEqual({
      exit_reason: "TAKE_PROFIT",
      symbol: "ETH/USDT",
      start: "2026-10-01",
      end: "2026-10-04T23:59:59",
    });
  });

  it("adds sort and paging for the list request", () => {
    expect(viewToApi(parse("min_conf=1&sort=pnl_pct&order=asc&offset=25"))).toMatchObject({
      sort: "pnl_pct",
      order: "asc",
      limit: 25,
      offset: 25,
    });
  });
});

describe("sort mapping", () => {
  it("maps table columns to server sort keys and back", () => {
    expect(sortStateToView({ id: "time", desc: true })).toEqual({ sort: "closed_at", order: "desc" });
    expect(sortStateToView({ id: "reason", desc: false })).toEqual({ sort: "exit_reason", order: "asc" });
    expect(sortStateToView({ id: "entry", desc: true })).toBeNull();
    expect(sortStateToView(null)).toBeNull();
    expect(sortStateFromView("pnl_pct", "asc")).toEqual({ id: "pnl_pct", desc: false });
    expect(sortStateFromView("opened_at", "desc")).toBeNull();
  });
});
