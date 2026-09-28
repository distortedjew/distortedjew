import "server-only";
import type { EmailProvider } from "./types";
import { MockEmailProvider } from "./mock-provider";
import { ResendEmailProvider } from "./resend-provider";

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  provider =
    process.env.EMAIL_PROVIDER === "resend" && apiKey && from
      ? new ResendEmailProvider(apiKey, from, process.env.EMAIL_API_BASE_URL || undefined)
      : new MockEmailProvider();
  return provider;
}

export * from "./types";
