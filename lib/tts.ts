import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Locale } from "@/lib/i18n";

// One warm, multilingual neural voice for every language, so the guide keeps the
// same intimate character across EN / FR / JA. Slightly slow and a touch lower
// for an unhurried, hypnotic read. This is Microsoft's "Ava Multilingual" neural
// voice — the one auditioned for this project — synthesized on the fly through
// Edge's free read-aloud endpoint (no key, no quota). Ava auto-matches the spoken
// language to the text, so a single voice serves all three languages.
const VOICE = "en-US-AvaMultilingualNeural";
const RATE = "-10%";
const PITCH = "-2%";

/**
 * The voice needs no credentials, so it is always available. If a synthesis call
 * fails (a Microsoft hiccup, or the box is offline), synthesize() throws and the
 * client falls back to the browser's own speech voice — the guide degrades
 * gracefully, it never goes silent.
 */
export function ttsConfigured(): boolean {
  return true;
}

/** Synthesize narration as MP3 via Microsoft Edge's read-aloud voice endpoint. */
export async function synthesize(text: string, _locale: Locale): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { rate: RATE, pitch: PITCH });

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    audioStream.on("data", (d: Buffer) => chunks.push(d));
    audioStream.on("end", () => resolve());
    audioStream.on("error", reject);
  });

  const buf = Buffer.concat(chunks);
  if (buf.length === 0) throw new Error("edge-tts: empty audio");
  return buf;
}
