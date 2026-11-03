import "dotenv/config";
import { readFileSync } from "node:fs";
import { transcribe } from "../src/core/meta";
import { similarity } from "../src/core/text";
import { globalLedger } from "../src/core/ledger";
const cases = [
  ["spikes/meta/audio/ko.wav", "야 금요일 7시 다 모여. 케이크는 누가 사? 제이한테는 비밀.", ["Korean"]],
  ["spikes/meta/audio/en.wav", "ok Friday 7pm. everyone hide in the kitchen", ["English"]],
  ["spikes/meta/audio/ko.wav", "야 금요일 7시 다 모여. 케이크는 누가 사? 제이한테는 비밀.", []],
] as const;
for (const [f, expected, bias] of cases) {
  const r = await transcribe(readFileSync(f), { languageBias: [...bias] });
  console.log(JSON.stringify({ f, bias, heard: r.transcript, sim: similarity(expected, r.transcript).toFixed(3), audioMs: r.audioDurationMs, ms: r.ms }));
}
console.log(JSON.stringify(globalLedger.summary()));
