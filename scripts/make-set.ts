// The miniature set, made by the same models as the figures so set and cast share one look:
//   Muse Image paints four walls (straight-on photos of a clay dining room), the floor and the tabletop from above,
//   and the props (cake, teapot, cups, plates); SAM 3.1 cuts each prop out. Writes public/set/*.webp.
//   npx tsx scripts/make-set.ts [--only walls,floor,props]
import "dotenv/config";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { generateImage, segment } from "../src/core/meta";
import { unionAlpha, applyAlpha, erodeAlpha } from "../src/core/persona";
import { globalLedger } from "../src/core/ledger";

const OUT = "public/set";
const SRC = "out/set-src";
const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "walls,floor,props").split(",");
const CLAY = "Everything is handmade from plasticine and painted wood with faint fingerprints and visible sculpting marks, a stop-motion film set, warm soft even lighting, no people, no text.";
const WALL = (content: string) =>
  `Claymation miniature set: one wall of a cozy dining room, photographed straight on, the wall fills the whole frame from the ceiling at the top edge down to the skirting board at the bottom edge, no floor and no ceiling visible: bottle-green patterned wallpaper above walnut wainscot panels; ${content}. ${CLAY}`;

const walls: [string, string][] = [
  ["wall-front", WALL("in the middle two small framed landscape paintings and a round wall clock, on the right a walnut sideboard with a little glowing lamp, a stack of books and a potted plant")],
  ["wall-left", WALL("in the middle a tall window with red velvet curtains tied back, showing a night sky with a crescent moon and stars")],
  ["wall-right", WALL("in the middle a tall walnut dresser with plates displayed on its shelves and a small framed embroidery of a flower beside it")],
  ["wall-back", WALL("in the middle a wooden door with a brass knob and a coat rack beside it with a striped scarf")],
];
const floor: [string, string][] = [
  ["floor", `Top-down photo looking straight down at a wooden floor of dark walnut-brown painted wood planks with plasticine texture, with a round rust and ochre patterned rug in the exact center, filling the frame. ${CLAY}`],
  ["tabletop", `Top-down photo looking straight down at a round walnut tabletop of painted wood and plasticine, the table fills the frame edge to edge, a cream lace doily exactly in the center, nothing else on it. ${CLAY}`],
];
const props: [string, string, string[]][] = [
  ["cake", `A small claymation birthday cake on a cake stand with five lit candles, pink icing drips, front view at a slight angle from above, centered, small in the frame with empty space around it, on a plain light gray background. ${CLAY}`, ["cake", "cake stand", "candles"]],
  ["teapot", `A small claymation teal teapot with a wooden handle, front view at a slight angle from above, centered, small in the frame with empty space around it, on a plain light gray background. ${CLAY}`, ["teapot"]],
  ["cup", `One small claymation white teacup on a saucer, front view at a slight angle from above, centered, small in the frame with empty space around it, on a plain light gray background. ${CLAY}`, ["cup", "saucer"]],
  ["plate", `One small empty claymation white plate, seen at a low angle from the front, centered, small in the frame with empty space around it, on a plain light gray background. ${CLAY}`, ["plate"]],
];

async function draw(name: string, prompt: string, size?: string) {
  const src = `${SRC}/${name}.png`;
  if (existsSync(src)) return readFileSync(src);
  const r = await generateImage(prompt, { size, format: "png", op: "set.draw" });
  writeFileSync(src, r.bytes);
  return r.bytes;
}

const jobs: Promise<void>[] = [];
if (only.includes("walls"))
  for (const [name, prompt] of walls)
    jobs.push(
      draw(name, prompt, "2048x1024").then(async (png) => {
        await sharp(png).resize({ width: 2048 }).webp({ quality: 84 }).toFile(`${OUT}/${name}.webp`);
        console.log(name, "ok");
      }),
    );
if (only.includes("floor"))
  for (const [name, prompt] of floor)
    jobs.push(
      draw(name, prompt).then(async (png) => {
        await sharp(png).resize({ width: 1600 }).webp({ quality: 84 }).toFile(`${OUT}/${name}.webp`);
        console.log(name, "ok");
      }),
    );
if (only.includes("props"))
  for (const [name, prompt, phrases] of props)
    jobs.push(
      draw(name, prompt).then(async (png) => {
        const { width: W, height: H } = await sharp(png).metadata();
        const masks = [];
        for (const p of phrases) masks.push(...(await segment(png, "image/png", p, { op: "set.mask" })).masks);
        // trim the mask edge so no light-gray background rims the clay in the dark room
        const alpha = erodeAlpha(await unionAlpha(masks, W!, H!), W!, H!, 3);
        const cut = await applyAlpha(png, alpha, W!, H!, 0.04);
        if (!cut.png) throw new Error(`${name}: SAM 3.1 found nothing`);
        writeFileSync(`${OUT}/${name}.webp`, cut.png);
        console.log(name, "ok", cut.width, "x", cut.height, "coverage", cut.coverage.toFixed(2));
      }),
    );
await Promise.all(jobs);
console.log("usd", globalLedger.summary().usd.toFixed(3));
