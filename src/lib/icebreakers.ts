const ICEBREAKERS = [
  "What's the most interesting place you've ever visited?",
  "What's one game you could play forever?",
  "What's your current favorite song?",
  "Would you rather explore space or the ocean?",
  "What's a hobby you picked up recently?",
  "What's the best meal you've had this year?",
  "If you could instantly learn one language, which would it be?",
  "What's a movie you can rewatch endlessly?",
  "Mountains or beaches?",
  "What's something you're weirdly good at?",
  "What's the last thing that made you laugh out loud?",
  "Coffee, tea, or neither?",
  "What's a skill you're currently learning?",
  "What's your go-to comfort show?",
  "If you had a free plane ticket anywhere, where would you go?",
];

/**
 * Returns a random conversation-starter prompt. This is a lightweight local
 * provider; swap the body for an AI_PROVIDER call to generate fresh, on-topic
 * prompts (e.g. seeded with the pair's shared interests) without touching
 * any call sites.
 */
export function getRandomIcebreaker(excluding?: string): string {
  const pool = excluding
    ? ICEBREAKERS.filter((p) => p !== excluding)
    : ICEBREAKERS;
  return pool[Math.floor(Math.random() * pool.length)];
}
