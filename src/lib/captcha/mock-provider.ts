import type { CaptchaProvider } from "./types";

/** Dev fallback — always passes. Used when CAPTCHA_SECRET is unset. */
export class MockCaptchaProvider implements CaptchaProvider {
  name = "mock";
  async verify(): Promise<boolean> {
    return true;
  }
}
