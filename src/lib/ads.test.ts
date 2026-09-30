import { describe, expect, it } from "vitest";
import { adSlotId, adsenseClient, adsTxt, showAdPlaceholders } from "./ads";

const on = {
  NEXT_PUBLIC_ADSENSE_CLIENT: "ca-pub-1234567890123456",
  NEXT_PUBLIC_ADSENSE_SLOT_LANDING: "1234567890",
  NEXT_PUBLIC_ADSENSE_SLOT_GAMES: "9876543210",
};

describe("ad configuration", () => {
  it("is off when nothing is configured", () => {
    expect(adsenseClient({})).toBeNull();
    expect(adSlotId("landing", {})).toBeNull();
    expect(adsTxt({})).toBeNull();
    expect(showAdPlaceholders({})).toBe(false);
  });

  it("reads the client and per-placement slots", () => {
    expect(adsenseClient(on)).toBe("ca-pub-1234567890123456");
    expect(adSlotId("landing", on)).toBe("1234567890");
    expect(adSlotId("games", on)).toBe("9876543210");
  });

  it("ignores malformed values instead of rendering broken ad tags", () => {
    expect(adsenseClient({ NEXT_PUBLIC_ADSENSE_CLIENT: "pub-123" })).toBeNull();
    expect(adsenseClient({ NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-123"><script>' })).toBeNull();
    expect(adSlotId("landing", { NEXT_PUBLIC_ADSENSE_SLOT_LANDING: "abc" })).toBeNull();
  });

  it("builds the ads.txt line from the publisher ID", () => {
    expect(adsTxt(on)).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("only shows placeholders when explicitly switched on", () => {
    expect(showAdPlaceholders({ NEXT_PUBLIC_AD_PLACEHOLDERS: "true" })).toBe(true);
    expect(showAdPlaceholders({ NEXT_PUBLIC_AD_PLACEHOLDERS: "1" })).toBe(false);
  });
});
