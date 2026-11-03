// Spike: can Muse Image build the set in the figures' own look (a wide clay backdrop, clay props to cut out with SAM 3.1)?
//   npx tsx scripts/spike-set.ts   → out/spike-set/*.png
import "dotenv/config";
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { generateImage } from "../src/core/meta";
import { globalLedger } from "../src/core/ledger";

const out = "out/spike-set";
const CLAY = "Everything is handmade from plasticine and painted wood with faint fingerprints and visible sculpting marks, a stop-motion film set, warm soft even lighting, no people, no text.";
const backdrop = `Claymation miniature set of a cozy dining room wall, photographed straight on at seated eye level: bottle-green patterned wallpaper above walnut wainscot panels, on the left a window with red velvet curtains showing a night sky with a crescent moon, in the middle two small framed landscape paintings and a round wall clock, on the right a walnut sideboard with a little glowing lamp, books and a potted plant, a wooden floor along the bottom. ${CLAY}`;
const jobs: [string, string, string | undefined][] = [
  ["backdrop-wide", backdrop, "1536x1024"],
  ["backdrop-xwide", backdrop, "2048x1024"],
  ["cake", `A small claymation birthday cake on a cake stand with five lit candles, pink icing drips, front view at a slight angle from above, centered, on a plain light gray background. ${CLAY}`, undefined],
  ["teaset", `A small claymation teal teapot and two white teacups on saucers, front view at a slight angle from above, centered, on a plain light gray background. ${CLAY}`, undefined],
  ["tabletop", `Top-down photo of a round walnut tabletop made of painted wood and plasticine with a cream lace doily in the middle, filling the frame, nothing on it. ${CLAY}`, undefined],
];
const t0 = Date.now();
await Promise.all(
  jobs.map(async ([name, prompt, size]) => {
    try {
      const r = await generateImage(prompt, { size, format: "png", op: "spike.set" });
      writeFileSync(`${out}/${name}.png`, r.bytes);
      const m = await sharp(r.bytes).metadata();
      console.log(name, size ?? "default", "→", m.width, "x", m.height, ((Date.now() - t0) / 1000).toFixed(0), "s");
    } catch (e) {
      console.log(name, "failed", String((e as Error).message).slice(0, 200));
    }
  }),
);
console.log("usd", globalLedger.summary().usd.toFixed(3));
