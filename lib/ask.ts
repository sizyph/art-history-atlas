import { type Locale } from "@/lib/i18n";

// Gemini 2.5 Flash with Google Search grounding — answers a visitor's art
// question to the point, then offers an anecdote, with real citations from the
// web. (2.0-flash is quota-capped on EU keys; 2.5-flash is the working tier.)
const MODEL = "gemini-2.5-flash";

export function askConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

const LANG_NAME: Record<Locale, string> = {
  en: "English",
  fr: "French",
  ja: "Japanese",
};

export type AskContext = { artist?: string; museum?: string; work?: string };
export type AskResult = { answer: string; sources: { title: string; uri: string }[] };

export async function ask(
  question: string,
  ctx: AskContext,
  locale: Locale,
): Promise<AskResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("not configured");

  const where = [
    ctx.museum ? `at the ${ctx.museum}` : null,
    ctx.artist ? `in ${ctx.artist}'s gallery` : null,
    ctx.work ? `standing before "${ctx.work}"` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const system =
    `You are a warm, erudite museum docent speaking aloud to a visitor` +
    `${where ? " " + where : ""}. Answer their question about art — a movement, ` +
    `an artist, a painting, a technique — clearly and to the point in at most ` +
    `three short sentences, then add one vivid, lesser-known anecdote in a final ` +
    `sentence. No lists, no headings, no markdown, no citations in the prose; ` +
    `this text will be read aloud. Reply in ${LANG_NAME[locale]}.`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: question }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent` +
    `?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);

  const data = await res.json();
  const cand = data?.candidates?.[0];
  const answer: string = (cand?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!answer) throw new Error("empty answer");

  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: { title: string; uri: string }[] = [];
  for (const c of chunks as { web?: { uri?: string; title?: string } }[]) {
    const uri = c.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: c.web?.title || uri, uri });
    if (sources.length >= 4) break;
  }

  return { answer, sources };
}
