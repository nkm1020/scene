// Spike, part two: put one picture's body under another picture's head and look at the seams.
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const out = "out/spike-heads";
mkdirSync(out, { recursive: true });
type Layer = { data: Buffer; w: number; h: number; cx: number; top: number; bottom: number; cy: number };

async function split(name: string, pic: string, part: "head" | "body", mirror = false): Promise<Layer> {
  let img = sharp(`public/seed/figures/${name}/${pic}.webp`).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const m = cleanHead(await sharp(`${out}/${name}-${pic}.head.png`).resize(w, h).extractChannel(0).raw().toBuffer(), w, h);
  const px = Buffer.from(data);
  let sx = 0, sy = 0, n = 0, top = h, bottom = 0;
  for (let i = 0; i < w * h; i++) {
    const head = m[i] / 255;
    if (m[i] > 127 && data[i * 4 + 3] > 127) {
      const x = i % w, y = (i / w) | 0;
      sx += x; sy += y; n++;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    px[i * 4 + 3] = Math.round(data[i * 4 + 3] * (part === "head" ? head : 1 - head));
  }
  let buf = px;
  let cx = sx / n;
  if (mirror) {
    buf = await sharp(px, { raw: { width: w, height: h, channels: 4 } }).flop().raw().toBuffer();
    cx = w - 1 - cx;
  }
  return { data: buf, w, h, cx, top, bottom, cy: sy / n };
}

/** A head is one solid lump: close small gaps, fill holes, keep the biggest piece. */
function cleanHead(src: Buffer, w: number, h: number): Buffer {
  let on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = src[i] > 127 ? 1 : 0;
  const morph = (a: Uint8Array, r: number, grow: boolean) => {
    const o = new Uint8Array(a.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = grow ? 0 : 1;
        for (let dy = -r; dy <= r && (grow ? !v : v); dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const xx = x + dx, yy = y + dy;
            const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : a[yy * w + xx];
            if (grow && s) { v = 1; break; }
            if (!grow && !s) { v = 0; break; }
          }
        o[y * w + x] = v;
      }
    return o;
  };
  on = morph(morph(on, 6, true), 6, false);
  // largest piece
  const lab = new Int32Array(w * h).fill(-1);
  let best = -1, bestN = 0;
  for (let i = 0, id = 0; i < on.length; i++) {
    if (!on[i] || lab[i] >= 0) continue;
    const st = [i]; lab[i] = id; let n = 0;
    while (st.length) {
      const j = st.pop()!; n++;
      const x = j % w, y = (j / w) | 0;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) if (k >= 0 && on[k] && lab[k] < 0) (lab[k] = id), st.push(k);
    }
    if (n > bestN) (bestN = n), (best = id);
    id++;
  }
  // fill holes: background not reachable from the border
  const outside = new Uint8Array(w * h);
  const st: number[] = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const j = st.pop()!;
    if (outside[j] || lab[j] === best) continue;
    outside[j] = 1;
    const x = j % w, y = (j / w) | 0;
    if (x > 0) st.push(j - 1); if (x < w - 1) st.push(j + 1); if (y > 0) st.push(j - w); if (y < h - 1) st.push(j + w);
  }
  const o = Buffer.alloc(w * h);
  for (let i = 0; i < o.length; i++) o[i] = outside[i] ? 0 : 255;
  return o;
}

async function mix(name: string, bodyPic: string, headPic: string, bodyMirror: boolean, headMirror: boolean) {
  const b = await split(name, bodyPic, "body", bodyMirror);
  const bh = await split(name, bodyPic, "head", bodyMirror); // where this body's own head was
  const h = await split(name, headPic, "head", headMirror);
  const dx = Math.round(bh.cx - h.cx);
  const dy = Math.round(bh.bottom - h.bottom);
  const px = Buffer.from(b.data);
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const sx = x - dx, sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= h.w || sy >= h.h) continue;
      const s = (sy * h.w + sx) * 4, d = (y * b.w + x) * 4, a = h.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) px[d + c] = Math.round(h.data[s + c] * a + px[d + c] * (1 - a));
      px[d + 3] = Math.max(px[d + 3], h.data[s + 3]);
    }
  return sharp(px, { raw: { width: b.w, height: b.h, channels: 4 } }).png().toBuffer();
}

const combos: [string, string, boolean, boolean][] = [
  ["q3", "neutral", false, false],
  ["q3", "happy", false, false],
  ["q3", "side", false, false],
  ["q3", "talk_a", true, false],
  ["neutral", "q3", false, true],
  ["neutral", "q3", false, false],
  ["laughing", "q3", false, true],
];
for (const n of ["sam", "mina", "jay"]) {
  const tiles = await Promise.all(combos.map(([b, h, bm, hm]) => mix(n, b, h, bm, hm).then((p) => sharp(p).resize(360, 360).flatten({ background: "#3a302a" }).png().toBuffer())));
  await sharp({ create: { width: 360 * tiles.length, height: 360, channels: 3, background: "#3a302a" } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * 360, top: 0 })))
    .png()
    .toFile(`${out}/${n}-mix.png`);
}
console.log("ok");
