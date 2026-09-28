import type { TranslationProvider, TranslationResult } from "./types";

/**
 * Speaks the LibreTranslate API contract (POST { q, source, target, format }
 * -> { translatedText, detectedLanguage? }), which is implemented by the
 * open-source LibreTranslate project and several compatible hosted/self-
 * hosted services. Point TRANSLATION_API_BASE_URL at any compatible
 * endpoint (self-hosted LibreTranslate, a hosted instance, or an adapter you
 * write for another provider behind the same contract).
 */
export class RemoteTranslationProvider implements TranslationProvider {
  name = "remote";

  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage = "auto",
  ): Promise<TranslationResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        q: text,
        source: sourceLanguage,
        target: targetLanguage,
        format: "text",
        ...(this.apiKey ? { api_key: this.apiKey } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`Translation provider returned ${res.status}`);
    }

    const data = (await res.json()) as {
      translatedText: string;
      detectedLanguage?: { language: string } | string;
    };

    const detected =
      typeof data.detectedLanguage === "string"
        ? data.detectedLanguage
        : data.detectedLanguage?.language;

    return { translatedText: data.translatedText, detectedSourceLanguage: detected };
  }
}
