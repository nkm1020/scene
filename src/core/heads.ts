// Replacement heads, the way a stop-motion puppet has them. SAM 3.1 finds the head in each picture of a figure
// ("head" finds a clay figure's hair, "face" its face: one phrase per call, unioned), code makes the union one solid
// lump, and the head is saved as its own cut-out. The stage then puts one picture's body under another picture's head,
// so a figure keeps its body turned to the table and turns only its head to whoever is talking.
import sharp from "sharp";
import { segment } from "./meta";
import { unionAlpha } from "./persona";
import type { Ledger } from "./ledger";

/** Pictures that get a separate head (asleep and waking up never turn their heads). */
export const HEAD_SKIP = new Set(["away", "wake"]);

/** Square max (grow) or min (shrink) filter of radius r, separable. */
function morph(a: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array {
  const pass = (src: Uint8Array, horizontal: boolean): Uint8Array => {
    const o = new Uint8Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = grow ? 0 : 1;
        for (let d = -r; d <= r; d++) {
          const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d;
          const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx];
          if (grow ? s : !s) {
            v = grow ? 1 : 0;
            break;
          }
        }
        o[y * w + x] = v;
      }
    return o;
  };
  return pass(pass(a, true), false);
}

/** One solid head: close small gaps, keep the big pieces (hair and face can come apart), fill every hole. */
export function solidHead(mask: Uint8Array, w: number, h: number, r = Math.max(2, Math.round(w / 130))): Uint8Array {
  let on: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = mask[i] > 127 ? 1 : 0;
  on = morph(morph(on, w, h, r, true), w, h, r, false);
  const lab = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || lab[i] >= 0) continue;
    const id = sizes.length;
    const st = [i];
    lab[i] = id;
    let n = 0;
    while (st.length) {
      const j = st.pop()!;
      n++;
      const x = j % w;
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) if (k >= 0 && k < on.length && on[k] && lab[k] < 0) (lab[k] = id), st.push(k);
    }
    sizes.push(n);
  }
  const big = Math.max(0, ...sizes);
  const keep = sizes.map((n) => n >= big * 0.1);
  // holes: whatever the border cannot reach
  const outside = new Uint8Array(w * h);
  const st: number[] = [];
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) {
    const j = st.pop()!;
    if (outside[j] || (lab[j] >= 0 && keep[lab[j]])) continue;
    outside[j] = 1;
    const x = j % w, y = (j / w) | 0;
    if (x > 0) st.push(j - 1);
    if (x < w - 1) st.push(j + 1);
    if (y > 0) st.push(j - w);
    if (y < h - 1) st.push(j + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 255;
  return out;
}

/**
 * The head of one picture as its own cut-out, the same size as the picture's cut-out (so it lines up where it was).
 * `image` is the opaque picture SAM 3.1 sees, `cutout` the figure cut-out (any scale). Null when no head is found.
 */
export async function headLayer(image: Buffer, cutout: Buffer, opts: { ledger?: Ledger } = {}): Promise<Buffer | null> {
  const { width: W, height: H } = await sharp(image).metadata();
  const found = await Promise.all(["head", "face"].map((phrase) => segment(image, "image/png", phrase, { op: "figure.head", ledger: opts.ledger }).catch(() => ({ masks: [] }))));
  const masks = found.flatMap((r) => r.masks.slice(0, 1));
  if (!masks.length) return null;
  const full = await unionAlpha(masks, W!, H!);
  const cut = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = cut.info;
  const small = await sharp(Buffer.from(full), { raw: { width: W!, height: H!, channels: 1 } }).resize(w, h).extractChannel(0).raw().toBuffer();
  const head = solidHead(new Uint8Array(small), w, h);
  const px = Buffer.from(cut.data);
  let on = 0;
  for (let i = 0; i < w * h; i++) {
    px[i * 4 + 3] = head[i] ? px[i * 4 + 3] : 0;
    if (px[i * 4 + 3] > 127) on++;
  }
  if (on < w * h * 0.004) return null;
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 88, alphaQuality: 100 }).toBuffer();
}
