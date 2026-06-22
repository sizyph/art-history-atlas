import { type Locale } from "@/lib/i18n";
import { docentSystem, type AskContext, type AskResult } from "@/lib/ask";

// Free, EU-available fallback brain. Llama 4 Scout is text + vision capable, so
// the deep-zoom "who is this?" still works; there is no web search, so answers
// come without source links. OpenAI-compatible API.
const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export function groqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export async function askGroq(
  question: string,
  ctx: AskContext,
  locale: Locale,
  image?: string,
): Promise<AskResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("not configured");

  const system = docentSystem(ctx, locale, !!image);

  // vision uses the multi-part content form; text-only is a plain string
  const userContent = image
    ? [
        { type: "text", text: question },
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${image}` },
        },
      ]
    : question;

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
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);

  const data = await res.json();
  const answer: string = (data?.choices?.[0]?.message?.content ?? "").trim();
  if (!answer) throw new Error("empty answer");

  return { answer, sources: [] };
}
