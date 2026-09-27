import type { CaptchaProvider } from "./types";

/** Real Cloudflare Turnstile verification. */
export class TurnstileCaptchaProvider implements CaptchaProvider {
  name = "turnstile";
  constructor(private secret: string) {}

  async verify(token: string | null | undefined): Promise<boolean> {
    if (!token) return false;
    try {
      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: this.secret, response: token }),
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as { success: boolean };
      return data.success === true;
    } catch (err) {
      console.error("[captcha] turnstile verification failed", err);
      return false;
    }
  }
}
