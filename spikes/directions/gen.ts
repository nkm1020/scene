import "dotenv/config";
import { writeFileSync } from "node:fs";
import { generateImage, editImage } from "../../src/core/meta";
import { globalLedger } from "../../src/core/ledger";
const who = "a young woman with long wavy brown hair with bangs, wearing a yellow cardigan, playful mood";
const styles: Record<string, string> = {
  hedcut: `Newspaper hedcut portrait: stipple dots and fine cross-hatching in black ink on plain white paper, head and shoulders, facing the viewer, centered, white background, no text, no frame. ${who}. Black ink only, no color.`,
  paper: `Cut-paper collage puppet: layered construction paper with visible fibers and slightly uneven scissor-cut edges, flat colors, head and upper body, facing the viewer, centered, plain light gray background, no text. ${who}.`,
  clay: `Claymation figurine: handmade plasticine miniature with faint fingerprints, soft daylight from a window, head and upper body, facing the viewer, centered, plain light gray background, no text. ${who}.`,
};
const laugh = "Same character, same art style, same framing and background. Only change the expression: laughing hard, eyes squeezed shut, mouth open.";
await Promise.all(
  Object.entries(styles).map(async ([k, prompt]) => {
    const a = await generateImage(prompt, { size: "1024x1024", format: "png", op: `dir.${k}` });
    writeFileSync(`spikes/directions/${k}-neutral.png`, a.bytes);
    const b = await editImage([a.bytes], laugh, { op: `dir.${k}.laugh` });
    writeFileSync(`spikes/directions/${k}-laugh.png`, b.bytes);
    console.log(k, a.ms, b.ms);
  }),
);
console.log(JSON.stringify(globalLedger.summary().usd));
