import "server-only";
import type { CaptchaProvider } from "./types";
import { MockCaptchaProvider } from "./mock-provider";
import { TurnstileCaptchaProvider } from "./turnstile-provider";

let provider: CaptchaProvider | null = null;

export function getCaptchaProvider(): CaptchaProvider {
  if (provider) return provider;
  const secret = process.env.CAPTCHA_SECRET;
  provider =
    process.env.CAPTCHA_PROVIDER === "turnstile" && secret
      ? new TurnstileCaptchaProvider(secret)
      : new MockCaptchaProvider();
  return provider;
}

export * from "./types";
