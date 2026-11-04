import "server-only";
import { db, publicUrl } from "./db";
import type { FigurePoseAsset } from "@/core/figure";

/** Upload one pose or replacement frame (cut-out image + mesh) and merge it into members.figure under `name`. */
export async function storePose(memberId: string, roomId: string, stamp: number, a: FigurePoseAsset, name: string = a.pose) {
  if (!a.cutout.length) return null;
  const base = `${roomId}/${memberId}/${stamp}/${name}`;
  await db().storage.from("figures").upload(`${base}.webp`, a.cutout, { contentType: "image/webp", upsert: true });
  let glb: string | null = null;
  if (a.glb) {
    await db().storage.from("figures").upload(`${base}.glb`, a.glb, { contentType: "model/gltf-binary", upsert: true });
    glb = publicUrl("figures", `${base}.glb`);
  }
  const val = { img: publicUrl("figures", `${base}.webp`), glb };
  await db().rpc("merge_figure", { m: memberId, pose: name, val });
  if (name === "neutral") await db().from("members").update({ persona_url: val.img }).eq("id", memberId);
  if (name === "away") await db().from("members").update({ persona_away_url: val.img }).eq("id", memberId);
  return val;
}

// ───────── the lookbook: your figure's files while you dress it ─────────

const lookPath = (roomId: string, memberId: string, name: string) => `${roomId}/${memberId}/look/${name}`;

export async function saveLook(roomId: string, memberId: string, name: string, buf: Buffer, contentType = "image/png") {
  const path = lookPath(roomId, memberId, name);
  const { error } = await db().storage.from("figures").upload(path, buf, { contentType, upsert: true });
  if (error) throw error;
  return `${publicUrl("figures", path)}?v=${Date.now().toString(36)}`;
}

export async function loadLook(roomId: string, memberId: string, name: string): Promise<Buffer> {
  const { data, error } = await db().storage.from("figures").download(lookPath(roomId, memberId, name));
  if (error || !data) throw new Error(`no ${name} for this figure yet: make your figure first`);
  return Buffer.from(await data.arrayBuffer());
}

/**
 * The figure you finished dressing becomes the neutral pose; its expressions and stop-motion frames are made from it
 * in the background (Muse Image edits, SAM 3.1 masks), and the stage picks each one up as it lands.
 */
export async function makeExpressions(memberId: string, roomId: string, current: Buffer, stamp: number, ledger: import("@/core/ledger").Ledger) {
  const { createFigurePoses, createFigureFrames } = await import("@/core/figure");
  await db().from("members").update({ figure_status: "posing" }).eq("id", memberId);
  try {
    const poses = await createFigurePoses(current, { ledger, onPose: async (a) => void (await storePose(memberId, roomId, stamp, a)) });
    await db().from("members").update({ figure_status: "ready" }).eq("id", memberId);
    const images: Record<string, Buffer> = { neutral: current };
    for (const p of poses) if (p.image.length) images[p.pose] = p.image;
    await createFigureFrames(images, { ledger, onFrame: async (name, a) => void (await storePose(memberId, roomId, stamp, a, name)) });
  } catch (e) {
    console.error("expressions failed", e);
    await db().from("members").update({ figure_status: "ready" }).eq("id", memberId);
  }
}
