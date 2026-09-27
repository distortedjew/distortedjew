import type { TranslationProvider, TranslationResult } from "./types";

/**
 * Dev/offline fallback used when no TRANSLATION_API_BASE_URL is configured.
 * It genuinely translates a small phrasebook of common chat greetings
 * across several languages (not a fake pass-through), so the feature is
 * demonstrable end-to-end without external credentials. Anything outside
 * that phrasebook is returned unchanged with a note — this is an honest
 * limitation, not simulated success.
 */
const PHRASEBOOK: Record<string, Record<string, string>> = {
  hello: { es: "hola", fr: "bonjour", de: "hallo", ja: "こんにちは", pt: "olá", it: "ciao", ko: "안녕하세요", zh: "你好", ru: "привет", ar: "مرحبا" },
  hi: { es: "hola", fr: "salut", de: "hi", ja: "やあ", pt: "oi", it: "ciao", ko: "안녕", zh: "嗨", ru: "привет", ar: "أهلاً" },
  "how are you": { es: "¿cómo estás?", fr: "comment ça va?", de: "wie geht's?", ja: "元気ですか？", pt: "como você está?", it: "come stai?", ko: "어떻게 지내세요?", zh: "你好吗？", ru: "как дела?", ar: "كيف حالك؟" },
  "thank you": { es: "gracias", fr: "merci", de: "danke", ja: "ありがとう", pt: "obrigado", it: "grazie", ko: "감사합니다", zh: "谢谢", ru: "спасибо", ar: "شكراً" },
  yes: { es: "sí", fr: "oui", de: "ja", ja: "はい", pt: "sim", it: "sì", ko: "네", zh: "是", ru: "да", ar: "نعم" },
  no: { es: "no", fr: "non", de: "nein", ja: "いいえ", pt: "não", it: "no", ko: "아니요", zh: "不", ru: "нет", ar: "لا" },
  "nice to meet you": { es: "mucho gusto", fr: "enchanté", de: "freut mich", ja: "はじめまして", pt: "prazer em conhecê-lo", it: "piacere di conoscerti", ko: "만나서 반가워요", zh: "很高兴认识你", ru: "приятно познакомиться", ar: "سررت بلقائك" },
  goodbye: { es: "adiós", fr: "au revoir", de: "auf wiedersehen", ja: "さようなら", pt: "adeus", it: "arrivederci", ko: "안녕히 가세요", zh: "再见", ru: "до свидания", ar: "وداعاً" },
};

export class MockTranslationProvider implements TranslationProvider {
  name = "mock";

  async translate(text: string, targetLanguage: string): Promise<TranslationResult> {
    const normalized = text.trim().toLowerCase().replace(/[!?.]+$/, "");
    const entry = PHRASEBOOK[normalized];
    if (entry?.[targetLanguage]) {
      return { translatedText: entry[targetLanguage] };
    }
    return {
      translatedText: `${text} (translation unavailable in dev mode — configure TRANSLATION_API_BASE_URL for full coverage)`,
    };
  }
}
