import { type Locale } from "@/lib/i18n";
import { docentSystem, wholeSentences, type AskContext, type AskResult } from "@/lib/ask";

// Free, EU-available fallback brain used when Gemini is rate-limited / daily-
// exhausted. Groq no longer offers a vision model, so this is text-only: it
// answers from the work plus the plain-words region ("lower-left part…") the
// docent already receives, without the pixels. No web search → no source links,
// and no anecdote (it couldn't check one). OpenAI-compatible API.
const MODEL = "openai/gpt-oss-120b";

export function groqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export async function askGroq(
  question: string,
  ctx: AskContext,
  locale: Locale,
  // the deep-zoom crop can't be shown to a text-only model; the region is in ctx
  _image?: string,
): Promise<AskResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("not configured");

  const system = docentSystem(ctx, locale, { webSearch: false });

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
      temperature: 0.7,
      // gpt-oss reasons before it answers, and that counts toward this cap (261
      // of 390 tokens on a simple question) — leave the reply ample room.
      max_completion_tokens: 2048,
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);

  const data = await res.json();
  const choice = data?.choices?.[0];
  const finish: string | undefined = choice?.finish_reason;
  if (finish && finish !== "stop" && finish !== "length") {
    throw new Error(`groq stopped: ${finish}`);
  }
  const text: string = (choice?.message?.content ?? "").trim();
  const answer = finish === "length" ? wholeSentences(text) : text;
  if (!answer) throw new Error(`groq empty: ${finish ?? "no choice"}`);

  return { answer, sources: [] };
}
