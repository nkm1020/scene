// Figure pipeline: three words → a seated clay figurine and its expressions, all Meta models.
//   Muse Image draws the figurine (neutral) → Muse Image edits it into each expression (same character)
//   → SAM 3.1 masks the figurine and its stool in every image → SAM 3D Objects lifts each one into a 3D mesh (GLB).
// The performance is these meshes: the director swaps them per line and per listener.

import sharp from "sharp";
import { generateImage, editImage, segment } from "./meta";
import { reconstruct3d } from "./sam3d";
import { unionAlpha, applyAlpha, type PersonaSpec } from "./persona";
import type { Ledger } from "./ledger";

export const FIGURE_POSES = ["neutral", "happy", "laughing", "surprised", "angry", "sad", "away"] as const;
export type FigurePose = (typeof FIGURE_POSES)[number];

const POSE_EDITS: Record<Exclude<FigurePose, "neutral">, string> = {
  happy: "smiling warmly with bright eyes, hands on the knees",
  laughing: "laughing hard, leaning back, eyes squeezed shut, mouth wide open, one hand on the belly",
  surprised: "shocked, eyes wide, mouth open, both hands raised beside the face",
  angry: "exasperated, frowning hard with arms crossed, mouth open mid-complaint",
  sad: "sad, shoulders slumped, looking down, small frown",
  away: "asleep on the stool: bent far forward at the waist, arms folded across the knees, head down resting on the folded arms so only the top of the head shows, like napping face-down on a desk",
};

/** Milder wording, tried once when the image model's content filter rejects the first edit. */
const POSE_EDITS_SOFT: Record<Exclude<FigurePose, "neutral">, string> = {
  happy: "gentle smile",
  laughing: "big happy laugh with eyes closed",
  surprised: "surprised face with raised eyebrows and round mouth",
  angry: "grumpy pout with arms crossed",
  sad: "sad face looking down",
  away: "napping bent forward at the waist, head down on folded arms",
};

export function figurePrompt(spec: PersonaSpec): string {
  return [
    `Claymation figurine of a person with ${spec.hair}, wearing ${spec.outfit}, ${spec.vibe} mood.`,
    "Handmade plasticine miniature with faint fingerprints, slightly oversized head, sitting upright on a small plain wooden stool, hands resting on the knees, both feet on the ground, full body with the whole stool visible, front view facing the camera.",
    "Soft even studio lighting with no hard shadows, plain light gray background, centered with empty space around it, nothing else in the frame, no text.",
  ].join(" ");
}

export function poseEditPrompt(pose: Exclude<FigurePose, "neutral">, soft = false): string {
  return `Same character, same clay style, still sitting on the same wooden stool, same full-body framing, same plain light gray background and even lighting. Only change the pose and expression: ${(soft ? POSE_EDITS_SOFT : POSE_EDITS)[pose]}.`;
}

/** Nearest available pose when one could not be made (content filter, failure). */
export const POSE_FALLBACK: Record<FigurePose, FigurePose[]> = {
  neutral: [],
  happy: ["laughing", "neutral"],
  laughing: ["happy", "neutral"],
  surprised: ["neutral"],
  angry: ["surprised", "sad", "neutral"],
  sad: ["away", "neutral"],
  away: ["sad", "neutral"],
};

export interface FigurePoseAsset {
  pose: FigurePose;
  image: Buffer; // opaque PNG from Muse Image
  cutout: Buffer; // transparent WebP (SAM 3.1 alpha)
  mask: Buffer; // full-frame PNG mask (white = figurine)
  glb: Buffer | null; // SAM 3D mesh
  coverage: number;
  error?: string;
}

/** SAM 3.1 mask of the figurine in an image, as a full-frame black/white PNG plus a transparent cutout. */
export async function maskFigure(image: Buffer, opts: { ledger?: Ledger; op?: string } = {}) {
  const { width: W, height: H } = await sharp(image).metadata();
  for (const phrase of ["person", "figurine", "clay figure"]) {
    const seg = await segment(image, "image/png", phrase, { op: opts.op ?? "figure.mask", ledger: opts.ledger });
    if (!seg.masks.length) continue;
    // The figure sits on a stool: SAM 3.1 takes one phrase per call, so the stool is a second call, unioned.
    const stool = await segment(image, "image/png", "stool", { op: opts.op ?? "figure.mask", ledger: opts.ledger }).catch(() => ({ masks: [] as typeof seg.masks }));
    const alpha = await unionAlpha([...seg.masks, ...stool.masks.slice(0, 1)], W!, H!);
    // one scale for every pose (half the source frame): the stage sizes poses against the neutral one
    const cut = await applyAlpha(image, alpha, W!, H!, 0, 0.5);
    if (!cut.png || cut.coverage < 0.03 || cut.coverage > 0.85) continue;
    const mask = await sharp(Buffer.from(alpha.map((v) => (v > 127 ? 255 : 0))), { raw: { width: W!, height: H!, channels: 1 } }).png().toBuffer();
    return { mask, cutout: cut.png, coverage: cut.coverage, phrase };
  }
  throw new Error("SAM 3.1 found no figurine");
}

async function liftPose(pose: FigurePose, image: Buffer, opts: { ledger?: Ledger; skip3d?: boolean }): Promise<FigurePoseAsset> {
  const m = await maskFigure(image, { ledger: opts.ledger, op: `figure.mask` });
  let glb: Buffer | null = null;
  let error: string | undefined;
  if (!opts.skip3d) {
    try {
      glb = (await reconstruct3d(image, m.mask, { ledger: opts.ledger, op: "figure.lift3d" })).glb;
    } catch (e) {
      error = (e as Error).message.slice(0, 200);
    }
  }
  return { pose, image, cutout: m.cutout, mask: m.mask, glb, coverage: m.coverage, error };
}

/** Draw the neutral figurine and lift it to 3D (the part a new member waits for). */
export async function createFigureBase(spec: PersonaSpec, opts: { ledger?: Ledger; skip3d?: boolean } = {}) {
  const img = await generateImage(figurePrompt(spec), { size: "1024x1024", format: "png", op: "figure.draw", ledger: opts.ledger });
  return liftPose("neutral", img.bytes, opts);
}

/** Every other pose: Muse Image edits of the neutral image, each masked and lifted. Runs in parallel. */
export async function createFigurePoses(
  neutralImage: Buffer,
  opts: { ledger?: Ledger; skip3d?: boolean; poses?: Exclude<FigurePose, "neutral">[]; onPose?: (a: FigurePoseAsset) => void | Promise<void> } = {},
): Promise<FigurePoseAsset[]> {
  const poses = opts.poses ?? (FIGURE_POSES.filter((p) => p !== "neutral") as Exclude<FigurePose, "neutral">[]);
  return Promise.all(
    poses.map(async (pose) => {
      try {
        let edited;
        try {
          edited = await editImage([neutralImage], poseEditPrompt(pose), { op: "figure.pose", ledger: opts.ledger });
        } catch (e) {
          if (!String((e as Error).message).includes("content_policy")) throw e;
          edited = await editImage([neutralImage], poseEditPrompt(pose, true), { op: "figure.pose", ledger: opts.ledger });
        }
        const a = await liftPose(pose, edited.bytes, opts);
        await opts.onPose?.(a);
        return a;
      } catch (e) {
        const a: FigurePoseAsset = { pose, image: Buffer.alloc(0), cutout: Buffer.alloc(0), mask: Buffer.alloc(0), glb: null, coverage: 0, error: (e as Error).message.slice(0, 200) };
        await opts.onPose?.(a);
        return a;
      }
    }),
  );
}
