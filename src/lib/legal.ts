import { APP_NAME } from "@/lib/constants";

/**
 * Who runs the site. Privacy law (GDPR, CCPA) and many countries' consumer
 * rules require the operator's name, a postal address and a contact email
 * to be published. Set these in .env; nothing here is guessed.
 */
export interface LegalDetails {
  /** Company or person legally responsible for the site. */
  entityName: string | null;
  /** Postal address, one line. */
  address: string | null;
  /** Where people send privacy, deletion and legal requests. */
  contactEmail: string | null;
  /** Country/state whose law governs the Terms, e.g. "Spain" or "Delaware, USA". */
  jurisdiction: string | null;
}

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function legalDetails(env: Record<string, string | undefined> = process.env): LegalDetails {
  return {
    entityName: clean(env.LEGAL_ENTITY_NAME),
    address: clean(env.LEGAL_ADDRESS),
    contactEmail: clean(env.LEGAL_CONTACT_EMAIL),
    jurisdiction: clean(env.LEGAL_JURISDICTION),
  };
}

/** Which required details are missing, for a startup warning. */
export function missingLegalDetails(details: LegalDetails = legalDetails()): string[] {
  const missing: string[] = [];
  if (!details.entityName) missing.push("LEGAL_ENTITY_NAME");
  if (!details.address) missing.push("LEGAL_ADDRESS");
  if (!details.contactEmail) missing.push("LEGAL_CONTACT_EMAIL");
  if (!details.jurisdiction) missing.push("LEGAL_JURISDICTION");
  return missing;
}

/** "Acme Ltd" or, if not configured yet, "the operator of Wisp". */
export function operatorName(details: LegalDetails = legalDetails()): string {
  return details.entityName ?? `the operator of ${APP_NAME}`;
}
