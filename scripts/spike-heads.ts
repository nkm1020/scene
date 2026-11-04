// Spike: replacement heads. SAM 3.1 finds the head in each picture of a figure; the body of one picture and the head of
// another are put together, so a figure can keep its body facing the table and turn only its head.
//   npx tsx scripts/spike-heads.ts   → out/spike-heads/*.png
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { segment } from "../src/core/meta";
import { unionAlpha } from "../src/core/persona";

const out = "out/spike-heads";
mkdirSync(out, { recursive: true });
const who = ["sam", "mina", "jay"];
const pics = ["neutral", "q3", "side", "happy", "talk_a", "laughing", "surprised"];

async function headMask(name: string, pic: string) {
  const file = `${out}/${name}-${pic}.head.png`;
  if (existsSync(file) && process.argv.includes("--redo")) (await import("node:fs")).unlinkSync(file);
  if (existsSync(file)) return file;
  const src = readFileSync(`public/seed/figures/${name}/${pic}.png`);
  const { width: W, height: H } = await sharp(src).metadata();
  // "head" finds the hair of a clay figure; "face" finds the face: one phrase per call, unioned
  const [hd, fc] = await Promise.all(["head", "face"].map((ph) => segment(src, "image/png", ph, { op: "spike.head" })));
  const a = await unionAlpha([...hd.masks.slice(0, 1), ...fc.masks.slice(0, 1)], W!, H!);
  writeFileSync(file, await sharp(Buffer.from(a), { raw: { width: W!, height: H!, channels: 1 } }).png().toBuffer());
  return file;
}

await Promise.all(who.flatMap((n) => pics.map((p) => headMask(n, p))));
// a sheet: each picture with its head mask tinted
for (const n of who) {
  const tiles = await Promise.all(
    pics.map(async (p) => {
      const cut = await sharp(`public/seed/figures/${n}/${p}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width: w, height: h } = cut.info;
      const m = await sharp(`${out}/${n}-${p}.head.png`).resize(w, h).extractChannel(0).raw().toBuffer();
      const px = Buffer.from(cut.data);
      for (let i = 0; i < w * h; i++) if (m[i] > 127) (px[i * 4] = Math.min(255, px[i * 4] * 0.5 + 128)), (px[i * 4 + 2] = px[i * 4 + 2] * 0.5);
      return sharp(px, { raw: { width: w, height: h, channels: 4 } }).resize(300, 300).flatten({ background: "#777" }).png().toBuffer();
    }),
  );
  await sharp({ create: { width: 300 * tiles.length, height: 300, channels: 3, background: "#777" } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * 300, top: 0 })))
    .png()
    .toFile(`${out}/${n}-masks.png`);
}
console.log("done");
