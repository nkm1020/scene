// Spike: can a figure change one part (hair, outfit, glasses, hat) while every other pixel, the face above all, stays the same?
// Muse Image edits the whole figure, SAM 3.1 finds the part in the old and the new image, and code copies only that region.
//   npx tsx scripts/spike-layers.ts   → out/spike-layers/*.png
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { editImage, segment } from "../src/core/meta";
import { unionAlpha } from "../src/core/persona";
import { globalLedger } from "../src/core/ledger";

const dir = "public/seed/figures/sam";
const out = "out/spike-layers";
const keep = "Same character, same face, same clay style, same stool, same pose, same framing, same plain light gray background and lighting. Change only this:";
const base = readFileSync(`${dir}/neutral.png`);
const { width: W, height: H } = await sharp(base).metadata();

async function mask(img: Buffer, phrase: string) {
  const r = await segment(img, "image/png", phrase, { op: `spike.${phrase}` });
  return unionAlpha(r.masks, W!, H!);
}
function dilate(a: Uint8Array, r: number) {
  const o = new Uint8Array(a.length);
  for (let y = 0; y < H!; y++)
    for (let x = 0; x < W!; x++) {
      let m = 0;
      for (let dy = -r; dy <= r && m < 255; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < H! && xx >= 0 && xx < W! && a[yy * W! + xx] > m) m = a[yy * W! + xx];
      }
      o[y * W! + x] = m;
    }
  return o;
}
async function blend(baseImg: Buffer, edited: Buffer, region: Uint8Array) {
  const b = await sharp(baseImg).removeAlpha().raw().toBuffer();
  const e = await sharp(edited).resize(W, H).removeAlpha().raw().toBuffer();
  const soft = await sharp(Buffer.from(region), { raw: { width: W!, height: H!, channels: 1 } }).blur(2).raw().toBuffer();
  const o = Buffer.alloc(b.length);
  for (let i = 0; i < W! * H!; i++) {
    const t = soft[i] / 255;
    for (let c = 0; c < 3; c++) o[i * 3 + c] = Math.round(b[i * 3 + c] * (1 - t) + e[i * 3 + c] * t);
  }
  return sharp(o, { raw: { width: W!, height: H!, channels: 3 } }).png().toBuffer();
}

const jobs: { name: string; prompt: string; phraseOld: string; phraseNew: string; protectFace: boolean }[] = [
  { name: "hair-pink", prompt: "the hair is now a pink high ponytail.", phraseOld: "hair", phraseNew: "hair", protectFace: true },
  { name: "outfit-varsity", prompt: "the green hoodie is now a red varsity jacket over a white t-shirt.", phraseOld: "hoodie", phraseNew: "jacket", protectFace: true },
  { name: "glasses", prompt: "add round black glasses.", phraseOld: "glasses", phraseNew: "glasses", protectFace: false },
  { name: "beanie", prompt: "add a red knit beanie on the head.", phraseOld: "hat", phraseNew: "hat", protectFace: true },
];
const t0 = Date.now();
const face = await mask(base, "face");
await Promise.all(
  jobs.map(async (j) => {
    const ed = (await editImage([base], `${keep} ${j.prompt}`, { op: "spike.edit" })).bytes;
    writeFileSync(`${out}/${j.name}.edit.png`, ed);
    const [mo, mn] = await Promise.all([mask(base, j.phraseOld), mask(ed, j.phraseNew)]);
    const region = dilate(new Uint8Array(mo.map((v, i) => Math.max(v, mn[i]))), 6);
    if (j.protectFace) for (let i = 0; i < region.length; i++) if (face[i] > 128) region[i] = 0;
    writeFileSync(`${out}/${j.name}.png`, await blend(base, ed, region));
    console.log(j.name, ((Date.now() - t0) / 1000).toFixed(0), "s");
  }),
);
// a stop-motion mouth: only the face region of an existing frame, pasted on the untouched figure
const talk = readFileSync(`${dir}/talk_a.png`);
const ft = await mask(talk, "face");
writeFileSync(`${out}/talk-facelock.png`, await blend(base, talk, dilate(new Uint8Array(face.map((v, i) => Math.max(v, ft[i]))), 4)));
console.log("usd", globalLedger.summary().usd.toFixed(3));
