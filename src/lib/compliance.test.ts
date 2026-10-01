import { describe, expect, it, vi } from "vitest";
import { CONSENT_COOKIE, parseConsent } from "./consent";
import { legalDetails, missingLegalDetails, operatorName } from "./legal";
import { isUnderage } from "./auth/age-gate";

vi.mock("server-only", () => ({}));

const { avatarKeyFromUrl } = await import("./account/anonymize");

describe("parseConsent", () => {
  it("reads a valid choice among other cookies", () => {
    expect(parseConsent(`a=1; ${CONSENT_COOKIE}=ads; b=2`)).toBe("ads");
    expect(parseConsent(`${CONSENT_COOKIE}=essential`)).toBe("essential");
  });

  it("ignores missing, unknown and look-alike cookies", () => {
    expect(parseConsent("")).toBeNull();
    expect(parseConsent(`${CONSENT_COOKIE}=yes`)).toBeNull();
    expect(parseConsent(`x${CONSENT_COOKIE}=ads`)).toBeNull();
  });
});

describe("legal details", () => {
  it("treats blank values as missing", () => {
    const details = legalDetails({ LEGAL_ENTITY_NAME: "  ", LEGAL_CONTACT_EMAIL: "legal@example.com" });
    expect(details.entityName).toBeNull();
    expect(details.contactEmail).toBe("legal@example.com");
    expect(missingLegalDetails(details)).toEqual(["LEGAL_ENTITY_NAME", "LEGAL_ADDRESS", "LEGAL_JURISDICTION"]);
  });

  it("names the operator, with a neutral fallback", () => {
    expect(operatorName(legalDetails({ LEGAL_ENTITY_NAME: "Acme Ltd" }))).toBe("Acme Ltd");
    expect(operatorName(legalDetails({}))).toBe("the operator of Wisp");
  });
});

describe("isUnderage", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  it("blocks anyone turning 17 or younger this year", () => {
    expect(isUnderage(2009, now)).toBe(true);
    expect(isUnderage(2008, now)).toBe(false);
    expect(isUnderage(1970, now)).toBe(false);
  });
});

describe("avatarKeyFromUrl", () => {
  it("extracts the storage key from local and CDN URLs", () => {
    expect(avatarKeyFromUrl("/uploads/avatars/u1/a.webp")).toBe("avatars/u1/a.webp");
    expect(avatarKeyFromUrl("https://cdn.example.com/avatars/u1/a.webp")).toBe("avatars/u1/a.webp");
    expect(avatarKeyFromUrl("https://example.com/other.png")).toBeNull();
    expect(avatarKeyFromUrl(null)).toBeNull();
  });
});
