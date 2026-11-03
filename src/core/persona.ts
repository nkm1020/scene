// Persona pipeline (no photo path for now):
//   3 words (hair, outfit, vibe) → Muse Image draws a stylized bust on a flat background
//   → SAM 3.1 segments the character → we build an alpha channel → persona.png (transparent).
// Muse Image always returns opaque images, so SAM is the alpha extractor.
// Checks (PLAN 6.6): largest mask covers 5–80% of the frame, alpha ≥ 3%. Else retry once, else default persona.

import sharp from "sharp";
import { generateImage, editImage, segment, type SamMask } from "./meta";
import type { Ledger } from "./ledger";

export interface PersonaSpec {
  name: string;
  hair: string; // e.g. "short black hair"
  outfit: string; // e.g. "green hoodie"
  vibe: string; // e.g. "cheerful"
}

export interface PersonaResult {
  png: Buffer; // transparent, cropped to the character with padding
  width: number;
  height: number;
  maskCoverage: number; // 0..1 of the source frame
  phrase: string; // SAM noun phrase that worked
  attempts: number;
  sourceImage: Buffer; // opaque generation (for debugging; not stored in production)
  flags: string[];
}

export const SAM_PHRASES = ["person", "cartoon character"] as const;

export function personaPrompt(spec: PersonaSpec): string {
  return [
    "Stylized sticker-style character portrait for a chat avatar.",
    "Upper body bust, facing the viewer, centered, head and shoulders fully inside the frame with empty space around them.",
    "Neutral friendly expression, mouth closed, eyes open.",
    "Thick clean dark outline, flat cel shading, simple shapes, not photorealistic, not a real person.",
    "Plain solid light gray background, nothing else in the frame, no text, no logo, no props.",
    `Character: ${spec.hair}, wearing ${spec.outfit}, ${spec.vibe} mood.`,
  ].join(" ");
}

function largestMask(masks: SamMask[]): SamMask | null {
  let best: SamMask | null = null;
  let bestArea = -1;
  for (const m of masks) {
    let area = 0;
    for (let i = 0; i < m.raster.length; i++) area += m.raster[i];
    if (area > bestArea) {
      best = m;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Union of all masks as a full-frame 0..255 alpha map.
 * SAM returns each mask raster at its own resolution (often smaller than the box),
 * so each raster is resized to its half-open bounds before placing it. Smooth resize = anti-aliased edge.
 */
export async function unionAlpha(masks: SamMask[], width: number, height: number): Promise<Uint8Array> {
  const alpha = new Uint8Array(width * height);
  for (const m of masks) {
    const bw = m.bounds.right - m.bounds.left;
    const bh = m.bounds.bottom - m.bounds.top;
    if (bw <= 0 || bh <= 0) continue;
    const src = Buffer.alloc(m.width * m.height);
    for (let i = 0; i < src.length; i++) src[i] = m.raster[i] ? 255 : 0;
    const scaled =
      bw === m.width && bh === m.height
        ? src
        : await sharp(src, { raw: { width: m.width, height: m.height, channels: 1 } })
            .resize(bw, bh, { fit: "fill", kernel: "cubic" })
            .extractChannel(0)
            .raw()
            .toBuffer();
    for (let y = 0; y < bh; y++) {
      const sy = m.bounds.top + y;
      if (sy < 0 || sy >= height) continue;
      for (let x = 0; x < bw; x++) {
        const sx = m.bounds.left + x;
        if (sx < 0 || sx >= width) continue;
        const v = scaled[y * bw + x];
        const i = sy * width + sx;
        if (v > alpha[i]) alpha[i] = v;
      }
    }
  }
  return alpha;
}

/** Apply a 0..255 alpha map to an image and crop to its bounding box with padding. */
export async function applyAlpha(image: Buffer, alpha: Uint8Array, width: number, height: number, pad = 0.06) {
  const { data } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(width * height * 4);
  let minX = width, minY = height, maxX = -1, maxY = -1, on = 0;
  for (let i = 0, p = 0; i < width * height; i++, p += 3) {
    rgba[i * 4] = data[p];
    rgba[i * 4 + 1] = data[p + 1];
    rgba[i * 4 + 2] = data[p + 2];
    rgba[i * 4 + 3] = alpha[i];
    if (alpha[i] > 127) {
      on++;
      const x = i % width, y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const coverage = on / (width * height);
  if (on === 0) return { png: null, coverage, width: 0, height: 0 };
  const px = Math.round((maxX - minX) * pad), py = Math.round((maxY - minY) * pad);
  const left = Math.max(0, minX - px), top = Math.max(0, minY - py);
  const w = Math.min(width, maxX + px + 1) - left, h = Math.min(height, maxY + py + 1) - top;
  // Slight blur on alpha only would need a separate pass; keep hard edges (sticker look).
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: w, height: h })
    .resize({ height: Math.min(h, 768), withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const meta = await sharp(png).metadata();
  return { png, coverage, width: meta.width ?? w, height: meta.height ?? h };
}

export async function createPersona(spec: PersonaSpec, opts: { ledger?: Ledger; maxAttempts?: number } = {}): Promise<PersonaResult> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const flags: string[] = [];
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const img = await generateImage(personaPrompt(spec), { size: "1024x1024", format: "png", op: "persona.draw", ledger: opts.ledger });
      const meta = await sharp(img.bytes).metadata();
      const W = meta.width!, H = meta.height!;
      for (const phrase of SAM_PHRASES) {
        const seg = await segment(img.bytes, "image/png", phrase, { op: "persona.alpha", ledger: opts.ledger });
        if (!seg.masks.length) continue;
        const main = largestMask(seg.masks)!;
        // Keep masks that overlap the main mask's box (parts of the same character).
        const parts = seg.masks.filter(
          (m) => m === main || (m.bounds.left < main.bounds.right && m.bounds.right > main.bounds.left && m.bounds.top < main.bounds.bottom && m.bounds.bottom > main.bounds.top),
        );
        const alpha = await unionAlpha(parts, W, H);
        const out = await applyAlpha(img.bytes, alpha, W, H);
        if (!out.png) continue;
        if (out.coverage < 0.05 || out.coverage > 0.8) {
          flags.push(`mask_coverage_out_of_range:${out.coverage.toFixed(3)}`);
          continue;
        }
        return { png: out.png, width: out.width, height: out.height, maskCoverage: out.coverage, phrase, attempts: attempt, sourceImage: img.bytes, flags };
      }
      flags.push(`no_mask_attempt_${attempt}`);
    } catch (err) {
      lastErr = err;
      flags.push(`error_attempt_${attempt}:${(err as Error).message.slice(0, 120)}`);
    }
  }
  const e = new Error(`persona failed after ${maxAttempts} attempts: ${flags.join("; ")}`);
  (e as any).cause = lastErr;
  throw e;
}

export const AWAY_PROMPT =
  "Same character, same art style, same outfit, same framing and plain light gray background. Only change the pose: head bowed forward and tilted down toward the table, eyes closed, dozing. Keep the thick outline and flat cel shading.";

/**
 * Presence posture: Muse Image edits the persona's own source image into an "away" pose (head bowed, eyes closed),
 * SAM 3.1 cuts it out the same way. Members who are not in the room are shown in this pose.
 */
export async function createAwayPose(sourceImage: Buffer, opts: { ledger?: Ledger } = {}): Promise<{ png: Buffer; width: number; height: number }> {
  const img = await editImage([sourceImage], AWAY_PROMPT, { op: "persona.away", ledger: opts.ledger });
  const meta = await sharp(img.bytes).metadata();
  const W = meta.width!, H = meta.height!;
  for (const phrase of SAM_PHRASES) {
    const seg = await segment(img.bytes, "image/png", phrase, { op: "persona.away_alpha", ledger: opts.ledger });
    if (!seg.masks.length) continue;
    const out = await applyAlpha(img.bytes, await unionAlpha(seg.masks, W, H), W, H);
    if (out.png && out.coverage >= 0.05 && out.coverage <= 0.8) return { png: out.png, width: out.width, height: out.height };
  }
  throw new Error("away pose: no usable mask");
}
