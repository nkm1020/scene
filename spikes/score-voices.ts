// Score TTS samples with Meta Voice Transcribe (strict read-back) to choose preset voices.
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { transcribe } from "../src/core/meta";
import { similarity } from "../src/core/text";
import { toVtWav } from "../src/core/wav";
const expected: Record<string, string> = JSON.parse(process.argv[2]);
for (const f of readdirSync("spikes/tts").filter((f) => f.endsWith(".wav"))) {
  const key = Object.keys(expected).find((k) => f.includes(k));
  if (!key) continue;
  const { wav, durationMs } = toVtWav(readFileSync(`spikes/tts/${f}`));
  const t = await transcribe(wav);
  console.log(`${f.padEnd(34)} ${(durationMs / 1000).toFixed(1)}s  score ${similarity(expected[key], t.transcript).toFixed(2)}  heard: ${t.transcript}`);
}
