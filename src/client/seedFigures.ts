// Seed cast figure assets served from /public/seed/figures/<id>/<pose>.{webp,glb}
import { SEED_MEMBERS } from "@/core/seed";
import type { FigureAssets } from "@/stage3d/engine";
export const POSES = ["neutral", "happy", "laughing", "surprised", "angry", "sad", "away"] as const;
export function seedFigure(id: string, hasGlb: boolean): FigureAssets {
  return Object.fromEntries(POSES.map((p) => [p, { img: `/seed/figures/${id}/${p}.webp`, glb: hasGlb ? `/seed/figures/${id}/${p}.glb` : null }]));
}
export const SEED_STAGE_MEMBERS = (hasGlb: boolean) =>
  SEED_MEMBERS.map((m) => ({ id: m.id, name: m.name, figure: seedFigure(m.id, hasGlb), present: m.id !== "jay" }));
