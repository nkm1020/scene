// Spike 2: keep Muse's whole edit, then paste the original face back (SAM 3.1 "face" in both images), skipping any accessory
// that sits on the face. Logs mask areas and how far the face moved between the two images.
//   npx tsx scripts/spike-facelock.ts   → out/spike-layers/*.lock.png
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { segment } from "../src/core/meta";
import { unionAlpha } from "../src/core/persona";
import { globalLedger } from "../src/core/ledger";

const out = "out/spike-layers";
const base = readFileSync("public/seed/figures/sam/neutral.png");
const W = 1600, H = 1600;
const mask = async (img: Buffer, phrase: string) => unionAlpha((await segment(img, "image/png", phrase, { op: `spike.${phrase}` })).masks, W, H);
const box = (a: Uint8Array) => {
  let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x] > 128) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { n, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
async function lock(edited: Buffer, faceBase: Uint8Array, skip: Uint8Array | null) {
  const b = await sharp(base).removeAlpha().raw().toBuffer();
  const e = await sharp(edited).removeAlpha().raw().toBuffer();
  const m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = skip && skip[i] > 64 ? 0 : faceBase[i];
  const soft = await sharp(Buffer.from(m), { raw: { width: W, height: H, channels: 1 } }).blur(3).raw().toBuffer();
  const o = Buffer.alloc(e.length);
  for (let i = 0; i < W * H; i++) {
    const t = soft[i] / 255;
    for (let c = 0; c < 3; c++) o[i * 3 + c] = Math.round(e[i * 3 + c] * (1 - t) + b[i * 3 + c] * t);
  }
  return sharp(o, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}
const faceBase = await mask(base, "face");
const fb = box(faceBase);
console.log("base face", fb);
const jobs: [string, string | null][] = [["hair-pink", null], ["outfit-varsity", null], ["glasses", "glasses"], ["beanie", "hat"]];
await Promise.all(
  jobs.map(async ([name, acc]) => {
    const ed = readFileSync(`${out}/${name}.edit.png`);
    const [fe, am] = await Promise.all([mask(ed, "face"), acc ? mask(ed, acc) : Promise.resolve(null)]);
    const be = box(fe);
    console.log(name, "face moved", (be.cx - fb.cx).toFixed(1), (be.cy - fb.cy).toFixed(1), "size", be.x1 - be.x0, "vs", fb.x1 - fb.x0, acc ? `${acc} px ${box(am!).n}` : "");
    writeFileSync(`${out}/${name}.lock.png`, await lock(ed, faceBase, am));
  }),
);
console.log("usd", globalLedger.summary().usd.toFixed(3));
