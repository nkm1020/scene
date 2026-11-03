// Spike: can Muse Image make stop-motion replacement frames (talking mouths, a laugh cycle) that hold still between frames?
//   npx tsx scripts/spike-motion.ts   → out/spike-motion/*.png + cycles as GIF
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { editImage } from "../src/core/meta";
import { globalLedger } from "../src/core/ledger";

const dir = "public/seed/figures/sam";
const out = "out/spike-motion";
const keep = "Same character, same clay style, same stool, same pose, same framing, same plain light gray background and lighting. Change nothing else:";
const jobs: [string, string, string][] = [
  ["talk_a", "neutral", `${keep} the mouth is open mid-word, as if talking.`],
  ["talk_b", "neutral", `${keep} the mouth is a small round "oh", as if talking.`],
  ["blink", "neutral", `${keep} the eyes are closed mid-blink.`],
  ["laugh_b", "laughing", "Same character, same clay style, same stool, same framing, same plain light gray background and lighting. Still laughing hard, but now leaning forward with one hand slapping the knee."],
];
const t0 = Date.now();
await Promise.all(
  jobs.map(async ([name, from, prompt]) => {
    const r = await editImage([readFileSync(`${dir}/${from}.png`)], prompt, { op: "spike.frame" });
    writeFileSync(`${out}/${name}.png`, r.bytes);
    console.log(name, "ok", ((Date.now() - t0) / 1000).toFixed(1), "s");
  }),
);
console.log("usd", globalLedger.summary().usd.toFixed(3));
