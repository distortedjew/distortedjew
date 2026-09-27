import type { EmailProvider, SendEmailInput } from "./types";

/**
 * Dev fallback — no external email service configured. Logs the message to
 * the server console instead of sending it, so flows like password reset
 * stay fully testable locally (the reset link is right there in the logs).
 */
export class MockEmailProvider implements EmailProvider {
  name = "mock";

  async send(input: SendEmailInput): Promise<boolean> {
    console.log(
      `[email:mock] To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`,
    );
    return true;
  }
}
