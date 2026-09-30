/** Optional Telegram alerts (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). Never throws; identical messages are sent at most every 10 min. */
export class Notifier {
  private sent = new Map<string, number>();
  constructor(private token: string, private chatId: string) {}
  get enabled() { return !!(this.token && this.chatId); }

  async send(text: string) {
    if (!this.enabled) return;
    const last = this.sent.get(text);
    if (last && Date.now() - last < 600_000) return;
    this.sent.set(text, Date.now());
    try {
      await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text: `[jev-agent] ${text}`.slice(0, 4000), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) { console.error("telegram:", (e as Error).message); }
  }
}
