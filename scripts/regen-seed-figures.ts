// Remake the seed cast on new neutral images (natural proportions): mask the neutral, then every expression and
// replacement frame from it. Writes public/seed/figures/<id>/<pose>.{png,webp,mask.png}.
//   npx tsx scripts/regen-seed-figures.ts <dir-with-<id>.png> [--only sam]
import "dotenv/config";
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { SEED_MEMBERS } from "../src/core/seed";
import { maskFigure, createFigurePoses, createFigureFrames, type FigurePoseAsset } from "../src/core/figure";
import { globalLedger } from "../src/core/ledger";

const src = process.argv[2];
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const save = (dir: string, a: FigurePoseAsset, name: string = a.pose) => {
  if (!a.image.length) return console.log(`  ${path.basename(dir)} ${name}: FAILED ${a.error}`);
  writeFileSync(path.join(dir, `${name}.png`), a.image);
  writeFileSync(path.join(dir, `${name}.webp`), a.cutout);
  writeFileSync(path.join(dir, `${name}.mask.png`), a.mask);
};
await Promise.all(
  SEED_MEMBERS.filter((m) => !only || m.id === only).map(async (m) => {
    const dir = `public/seed/figures/${m.id}`;
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) rmSync(path.join(dir, f)); // no stale poses from the old figure
    const image = readFileSync(path.join(src, `${m.id}.png`));
    const mk = await maskFigure(image);
    save(dir, { pose: "neutral", image, cutout: mk.cutout, mask: mk.mask, glb: null, coverage: mk.coverage });
    const poses = await createFigurePoses(image, { skip3d: true, onPose: (a) => save(dir, a) });
    const images: Record<string, Buffer> = { neutral: image };
    for (const p of poses) if (p.image.length) images[p.pose] = p.image;
    await createFigureFrames(images, { skip3d: true, onFrame: (name, a) => save(dir, a, name) });
    console.log(`${m.name} done`);
  }),
);
console.log("usd", globalLedger.summary().usd.toFixed(3));
