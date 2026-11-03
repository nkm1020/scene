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
