export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: string;
}

export interface TranslationProvider {
  name: string;
  translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult>;
}
