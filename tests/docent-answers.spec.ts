import { test, expect } from "@playwright/test";
import { ask, docentSystem, wholeSentences } from "@/lib/ask";
import { askGroq } from "@/lib/askGroq";

// The docent's answer handling, offline: canned Gemini / Groq replies for the
// ways a model can stop. No browser, no network, no quota.

const cutLive = 'Chiaroscuro, from the Italian words for "light" and "dark," is an';
const threeThenCut =
  "Chiaroscuro is a contrast of light and dark. Caravaggio pushed it to tenebrism. " +
  "Here a beam of light picks out Matthew.\n\n" +
  "Caravaggio himself was known for his temper and was even involved";

// what the docent last sent to the (stubbed) provider
type Sent = {
  systemInstruction: { parts: { text: string }[] };
  generationConfig: { maxOutputTokens: number; thinkingConfig: { thinkingBudget: number } };
  max_completion_tokens: number;
  messages: { content: string }[];
};
const realFetch = globalThis.fetch;
let sent = {} as Sent;
const reply = (json: unknown) => {
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify(json), { status: 200 });
  }) as typeof fetch;
};
const gemini = (finishReason: string, text: string, extra = {}) => ({
  candidates: [{ finishReason, content: { parts: [{ text }] }, ...extra }],
});

test.beforeAll(() => {
  process.env.GEMINI_API_KEY ??= "test";
  process.env.GROQ_API_KEY ??= "test";
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a cut-off answer keeps only its finished sentences", () => {
  expect(wholeSentences(cutLive)).toBe("");
  expect(wholeSentences(threeThenCut)).toMatch(/picks out Matthew\.$/);
  expect(wholeSentences("One. Two! Three?")).toBe("One. Two! Three?");
  expect(wholeSentences("He painted it. See The Calling of St. Matthew, c. 1600, and")).toBe(
    "He painted it.",
  );
  expect(wholeSentences("Quelle lumière ! Peinte vers 300 av. J.-C. par")).toBe("Quelle lumière !");
  expect(wholeSentences("光と影の対比です。カラヴァッジョは")).toBe("光と影の対比です。");
});

test("Gemini: thinking is bounded and the answer has room", async () => {
  reply(gemini("STOP", "Fine."));
  await ask("q", {}, "en");
  const { maxOutputTokens, thinkingConfig } = sent.generationConfig;
  expect(maxOutputTokens - thinkingConfig.thinkingBudget).toBeGreaterThanOrEqual(1024);
});

test("Gemini: a token-cap stop is trimmed; a recitation stop falls back", async () => {
  const web = { groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.org/a" } }] } };
  reply(gemini("MAX_TOKENS", threeThenCut, web));
  const r = await ask("q", {}, "en");
  expect(r.answer).toMatch(/picks out Matthew\.$/);
  expect(r.sources).toHaveLength(1);

  reply(gemini("MAX_TOKENS", cutLive));
  await expect(ask("q", {}, "en")).rejects.toThrow(/MAX_TOKENS/);
  reply(gemini("RECITATION", "Text copied from the web."));
  await expect(ask("q", {}, "en")).rejects.toThrow(/RECITATION/);
});

test("Groq: a token-cap stop is trimmed, and it adds no anecdote", async () => {
  reply({ choices: [{ finish_reason: "length", message: { content: "First one. Second is cut mid" } }] });
  expect((await askGroq("q", {}, "en")).answer).toBe("First one.");
  expect(sent.max_completion_tokens).toBeGreaterThanOrEqual(2048);
  expect(sent.messages[0].content).toMatch(/Do not add an anecdote/);
  expect(docentSystem({}, "en")).toMatch(/lesser-known anecdote/); // Gemini still tells one
});

test("both brains get the notes on the work in view", async () => {
  const notes = "Title: The Calling of Saint Matthew\nIt depicts Jesus calling Matthew.";
  const ctx = { work: "The Calling of Saint Matthew", notes };

  reply(gemini("STOP", "Fine."));
  await ask("q", ctx, "en");
  expect(sent.systemInstruction.parts[0].text).toContain(`NOTES ON THE WORK:\n${notes}`);

  reply({ choices: [{ finish_reason: "stop", message: { content: "Fine." } }] });
  await askGroq("q", ctx, "en");
  const groqSystem = sent.messages[0].content;
  expect(groqSystem).toContain(notes);
  expect(groqSystem).toMatch(/never contradict them/);
  // it can't see the painting: where things are in it only from the notes
  expect(groqSystem).toMatch(/never say where things are in it[\s\S]*unless the NOTES/);

  const bare = docentSystem({}, "en", { webSearch: false });
  expect(bare).not.toContain("NOTES");
  expect(bare).toMatch(/never say where things are in it/);
});
