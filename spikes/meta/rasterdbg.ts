import "dotenv/config";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { segment } from "../../src/core/meta";
const img = readFileSync(`spikes/meta/Sam-source.png`);
const seg = await segment(img, "image/png", "person");
const m = seg.masks[0];
const r = m.raster;
let ones = 0, other = 0; for (const v of r) { if (v === 1) ones++; else if (v !== 0) other++; }
console.log({ len: r.length, wh: m.width * m.height, ones, other, w: m.width, h: m.height });
const buf = Buffer.from(r.map((v) => (v ? 255 : 0)));
await sharp(buf, { raw: { width: m.width, height: m.height, channels: 1 } }).png().toFile("spikes/meta/mask-rowmajor.png");
// column-major interpretation: data[x*H + y]
const cm = Buffer.alloc(r.length);
for (let x = 0; x < m.width; x++) for (let y = 0; y < m.height; y++) cm[y * m.width + x] = r[x * m.height + y] ? 255 : 0;
await sharp(cm, { raw: { width: m.width, height: m.height, channels: 1 } }).png().toFile("spikes/meta/mask-colmajor.png");
