import "server-only";
import type { TranslationProvider } from "./types";
import { MockTranslationProvider } from "./mock-provider";
import { RemoteTranslationProvider } from "./remote-provider";

let provider: TranslationProvider | null = null;

export function getTranslationProvider(): TranslationProvider {
  if (provider) return provider;

  const baseUrl = process.env.TRANSLATION_API_BASE_URL;
  if (process.env.TRANSLATION_PROVIDER && process.env.TRANSLATION_PROVIDER !== "mock" && baseUrl) {
    provider = new RemoteTranslationProvider(baseUrl, process.env.TRANSLATION_API_KEY);
  } else {
    provider = new MockTranslationProvider();
  }
  return provider;
}

export * from "./types";
