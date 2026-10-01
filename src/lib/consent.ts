/**
 * Cookie consent, kept in a first-party cookie so it survives reloads and
 * is readable without JavaScript frameworks. Only ads need consent; the
 * login cookie is strictly necessary.
 */
export const CONSENT_COOKIE = "wisp_consent";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export type ConsentChoice = "ads" | "essential";

export const CONSENT_CHANGED_EVENT = "wisp:consent-changed";
export const OPEN_CONSENT_EVENT = "wisp:open-consent";

/** Parses the consent cookie out of a Cookie header / document.cookie string. */
export function parseConsent(cookieString: string): ConsentChoice | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CONSENT_COOKIE) {
      const value = rest.join("=");
      return value === "ads" || value === "essential" ? value : null;
    }
  }
  return null;
}

/** True when the browser asks sites not to sell or share data (Global Privacy Control). */
export function globalPrivacyControl(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  return parseConsent(document.cookie);
}

/**
 * The choice that applies right now. A GPC signal always means no ads,
 * even if ad cookies were accepted earlier.
 */
export function effectiveConsent(): ConsentChoice | null {
  if (globalPrivacyControl()) return "essential";
  return readConsent();
}

export function saveConsent(choice: ConsentChoice): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: choice }));
}

export function openConsentSettings(): void {
  window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
}
