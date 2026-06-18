import type { Locale } from "@/lib/i18n";

// One warm, multilingual neural voice for every language, so the guide keeps the
// same intimate character across EN / FR / JA. Slightly slow and a touch lower
// for an unhurried, hypnotic read. (Azure's "Ava Multilingual" — the natural
// voice auditioned for this project.)
const VOICE = "en-US-AvaMultilingualNeural";
const RATE = "-10%";
const PITCH = "-2%";

const BCP47: Record<Locale, string> = { en: "en-US", fr: "fr-FR", ja: "ja-JP" };

/** Whether the Azure Speech credentials are present (else: browser-voice fallback). */
export function ttsConfigured(): boolean {
  return !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<"
      ? "&lt;"
      : c === ">"
        ? "&gt;"
        : c === "&"
          ? "&amp;"
          : c === "'"
            ? "&apos;"
            : "&quot;",
  );
}

function ssml(text: string, locale: Locale): string {
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${BCP47[locale]}">` +
    `<voice name="${VOICE}"><prosody rate="${RATE}" pitch="${PITCH}">${escapeXml(text)}</prosody></voice>` +
    `</speak>`
  );
}

/** Synthesize narration as MP3 via the official Azure Speech REST API. */
export async function synthesize(text: string, locale: Locale): Promise<Buffer> {
  const key = process.env.AZURE_SPEECH_KEY!;
  const region = process.env.AZURE_SPEECH_REGION!;
  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "ars-gratia-artis",
      },
      body: ssml(text, locale),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Azure TTS ${res.status} ${detail}`.trim());
  }
  return Buffer.from(await res.arrayBuffer());
}
