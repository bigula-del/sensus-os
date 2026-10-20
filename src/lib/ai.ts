/** Claude (Anthropic API) for analysis and drafting. Only active when ANTHROPIC_API_KEY is set in Vercel. */
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY?.trim();

export class AiOff extends Error {
  constructor() { super("AI is not switched on yet: the ANTHROPIC_API_KEY setting is missing in Vercel."); }
}

/** Sends one prompt and returns the reply text. */
export async function askClaude(prompt: string, maxTokens = 4000, timeoutMs = 110000): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new AiOff();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 401) throw new Error("The AI key in Vercel is not valid.");
  if (!res.ok) throw new Error("The AI service did not answer. Try again in a minute.");
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
}

/** Extracts the first JSON object from a reply. */
export function jsonFrom<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The AI answer could not be read. Try again.");
  return JSON.parse(m[0]) as T;
}
