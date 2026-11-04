// Seed cast figure assets served from /public/seed/figures/<id>/<pose>.{webp,glb}
import { SEED_MEMBERS } from "@/core/seed";
import type { FigureAssets } from "@/stage3d/engine";
export const POSES = ["neutral", "happy", "laughing", "surprised", "angry", "sad", "away"] as const;
/** Stop-motion replacement frames (mouths, blink, wake, the other half of each expression). */
export const FRAMES = ["talk_a", "talk_b", "blink", "wake", "happy_b", "laughing_b", "surprised_b", "angry_b", "sad_b", "q3", "side", "q3_talk", "side_talk", "away_q3", "away_side"] as const;
export function seedFigure(id: string, hasGlb: boolean): FigureAssets {
  return Object.fromEntries(
    [...POSES, ...FRAMES].map((p) => [p, { img: `/seed/figures/${id}/${p}.webp`, glb: hasGlb ? `/seed/figures/${id}/${p}.glb` : null }]),
  );
}
export const SEED_STAGE_MEMBERS = (hasGlb: boolean) =>
  SEED_MEMBERS.map((m) => ({ id: m.id, name: m.name, figure: seedFigure(m.id, hasGlb), present: m.id !== "jay" }));
