import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { generateImage, editImage, segment } from "../../src/core/meta";
import { unionAlpha, applyAlpha } from "../../src/core/persona";
import { globalLedger } from "../../src/core/ledger";
const people = {
  sam: { who: "a young man with short messy black hair, wearing a green hoodie, cheerful mood", edit: "Only change the expression: shouting with both hands raised, eyes wide, mouth open wide." },
  jay: { who: "a young man with short bleached blond hair, wearing a denim jacket, smug mood", edit: "Only change the expression: raised eyebrows, mouth slightly open, confused." },
};
const style = (k: string, who: string) =>
  ({
    hedcut: `Newspaper hedcut portrait: stipple dots and fine cross-hatching in black ink on plain white paper, head and shoulders, facing the viewer, centered, white background, no text, no frame. ${who}. Black ink only, no color.`,
    paper: `Cut-paper collage puppet: layered construction paper with visible fibers and slightly uneven scissor-cut edges, flat colors, head and upper body, facing the viewer, centered, plain light gray background, no text. ${who}.`,
    clay: `Claymation figurine: handmade plasticine miniature with faint fingerprints, soft daylight from a window, head and upper body, facing the viewer, centered, plain light gray background, no text. ${who}.`,
  })[k]!;
const cut = async (name: string, png: Buffer) => {
  const { width: W, height: H } = await sharp(png).metadata();
  const seg = await segment(png, "image/png", "person");
  const out = await applyAlpha(png, await unionAlpha(seg.masks, W!, H!), W!, H!);
  writeFileSync(`spikes/directions/${name}.webp`, out.png!);
};
const jobs: Promise<void>[] = [];
for (const k of ["hedcut", "paper", "clay"]) {
  for (const [id, p] of Object.entries(people)) {
    jobs.push(
      (async () => {
        const a = await generateImage(style(k, p.who), { size: "1024x1024", format: "png", op: `dir.${k}` });
        const b = await editImage([a.bytes], `Same character, same art style, same framing and background. ${p.edit}`, { op: `dir.${k}.edit` });
        await Promise.all([cut(`${k}-${id}-neutral`, a.bytes), cut(`${k}-${id}-react`, b.bytes)]);
        console.log(k, id, "ok");
      })(),
    );
  }
  for (const v of ["neutral", "laugh"]) jobs.push(cut(`${k}-mina-${v}`, readFileSync(`spikes/directions/${k}-${v}.png`)));
}
await Promise.all(jobs);
console.log("usd", globalLedger.summary().usd.toFixed(3));
