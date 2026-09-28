import type { EmailProvider, SendEmailInput } from "./types";

/**
 * Real email delivery via the Resend HTTP API (https://resend.com). Uses
 * plain fetch rather than their SDK to avoid an extra dependency for a
 * single POST request. Any Resend-compatible endpoint can be used by
 * overriding EMAIL_API_BASE_URL.
 */
export class ResendEmailProvider implements EmailProvider {
  name = "resend";

  constructor(
    private apiKey: string,
    private from: string,
    private baseUrl = "https://api.resend.com",
  ) {}

  async send(input: SendEmailInput): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/emails`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.error("[email:resend] send failed", res.status, await res.text().catch(() => ""));
        return false;
      }
      return true;
    } catch (err) {
      console.error("[email:resend] send failed", err);
      return false;
    }
  }
}
