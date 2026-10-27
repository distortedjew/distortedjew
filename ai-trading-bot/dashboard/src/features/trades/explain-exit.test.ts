import { describe, expect, it } from "vitest";
import { makeTrade } from "@/test/fixtures";
import { explainExit } from "./explain-exit";

describe("explainExit", () => {
  it("names the level and the result for a stop loss", () => {
    const text = explainExit(
      makeTrade({ exit_reason: "STOP_LOSS", stop_loss: 96_200, exit_price: 96_200, r_multiple: -1 }),
    );
    expect(text).toContain("96,200.00");
    expect(text).toContain("−1.00R");
    expect(text).not.toContain("from the level");
  });

  it("mentions slippage when the fill is away from the level", () => {
    expect(
      explainExit(makeTrade({ exit_reason: "STOP_LOSS", stop_loss: 100, exit_price: 99, r_multiple: -1.2 })),
    ).toContain("from the level");
  });

  it("covers the opposite direction on a reversal and the holding time on a time exit", () => {
    expect(explainExit(makeTrade({ exit_reason: "SIGNAL_REVERSAL", side: "LONG" }))).toContain(
      "short signal",
    );
    expect(explainExit(makeTrade({ exit_reason: "TIME_EXIT", duration_sec: 7_200 }))).toContain("2h 0m");
    expect(explainExit(makeTrade({ exit_reason: "KILL_SWITCH" }))).toContain("daily loss limit");
  });
});
