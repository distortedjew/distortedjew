/** Minimal OpenRouter chat call (OpenAI-compatible) returning the reply text. */
export interface OpenRouterOpts { apiKey: string; model: string; fallbackModels: string[]; timeoutMs: number }

export async function askOpenRouter(o: OpenRouterOpts, messages: { role: string; content: string }[]) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json", "x-title": "jev-agent" },
    body: JSON.stringify({
      model: o.model,
      ...(o.fallbackModels.length ? { models: [o.model, ...o.fallbackModels] } : {}),
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) throw new Error(`openrouter ${r.status}: ${body.error?.message ?? JSON.stringify(body).slice(0, 200)}`);
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("openrouter: empty reply");
  return { text: String(text), model: String(body.model ?? o.model) };
}

/** Pulls the first JSON object out of a model reply (tolerates code fences and preamble). */
export function extractJson(text: string): any {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}
