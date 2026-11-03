import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { createPersona } from "../src/core/persona";
import { globalLedger } from "../src/core/ledger";

const spec = { name: process.argv[2] ?? "Sam", hair: process.argv[3] ?? "short messy black hair", outfit: process.argv[4] ?? "an oversized green hoodie", vibe: process.argv[5] ?? "cheerful" };
mkdirSync("spikes/meta", { recursive: true });
const t0 = Date.now();
try {
  const p = await createPersona(spec, { ledger: globalLedger });
  writeFileSync(`spikes/meta/${spec.name}-source.png`, p.sourceImage);
  writeFileSync(`spikes/meta/${spec.name}-persona.png`, p.png);
  console.log(JSON.stringify({ ok: true, name: spec.name, phrase: p.phrase, coverage: p.maskCoverage, size: [p.width, p.height], attempts: p.attempts, flags: p.flags, totalMs: Date.now() - t0 }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: (e as Error).message, totalMs: Date.now() - t0 }));
}
console.log(JSON.stringify(globalLedger.entries, null, 0));
