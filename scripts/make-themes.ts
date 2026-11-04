// The ready-made room themes beside the dining room (public/set/<theme>/*.webp), and the double doors you walk
// through into a room (public/set/doors.webp). Muse Image paints every surface in the cast's clay look.
//   npx tsx scripts/make-themes.ts [--only cafe,rooftop,doors]
import "dotenv/config";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { generateImage } from "../src/core/meta";
import { SET_THEMES, drawSet } from "../src/core/sets";
import { globalLedger } from "../src/core/ledger";

const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "cafe,rooftop,doors").split(",");

const DOORS =
  "Claymation miniature set: a pair of tall double doors photographed straight on, the two doors fill the whole frame edge to edge and top to bottom, meeting in a seam exactly down the middle: warm walnut-brown painted wooden doors with simple raised panels, a small round brass knob on each door beside the seam, a faint warm glow in the thin gap between them. Everything is handmade from plasticine and painted wood with faint fingerprints and visible sculpting marks, a stop-motion film set, warm soft even lighting, no people, no text.";

const jobs: Promise<void>[] = [];
for (const theme of ["cafe", "rooftop"].filter((t) => only.includes(t))) {
  jobs.push(
    (async () => {
      const dir = `public/set/${theme}`;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const parts = await drawSet(SET_THEMES[theme].spec);
      for (const [part, buf] of Object.entries(parts)) writeFileSync(`${dir}/${part}.webp`, buf);
      console.log(theme, "ok");
    })(),
  );
}
if (only.includes("doors"))
  jobs.push(
    (async () => {
      const img = await generateImage(DOORS, { size: "1024x2048", format: "png", op: "set.draw" });
      await sharp(img.bytes).resize({ width: 1200 }).webp({ quality: 86 }).toFile("public/set/doors.webp");
      console.log("doors ok");
    })(),
  );
await Promise.all(jobs);
console.log("usd", globalLedger.summary().usd.toFixed(3));
