// Draw the seed cast as clay figurines with all poses (Muse Image + SAM 3.1), and lift to 3D if FAL_KEY is set.
// Output: public/seed/figures/<id>/<pose>.{png,webp,mask.png,glb}
//   npx tsx scripts/make-seed-figures.ts [--only sam] [--lift-existing] [--poses away,sad] [--frames [talk_a,blink]] [--recut]
import "dotenv/config";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SEED_MEMBERS } from "../src/core/seed";
import { createFigureBase, createFigurePoses, createFigureFrames, FIGURE_POSES, FIGURE_FRAMES, type FigurePoseAsset } from "../src/core/figure";
import { reconstruct3d } from "../src/core/sam3d";
import { globalLedger } from "../src/core/ledger";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const skip3d = !process.env.FAL_KEY;
const save = (dir: string, a: FigurePoseAsset, name: string = a.pose) => {
  if (!a.image.length) return console.log(`  ${dir} ${name}: FAILED ${a.error}`);
  writeFileSync(path.join(dir, `${name}.png`), a.image);
  writeFileSync(path.join(dir, `${name}.webp`), a.cutout);
  writeFileSync(path.join(dir, `${name}.mask.png`), a.mask);
  if (a.head) writeFileSync(path.join(dir, `${name}.head.webp`), a.head);
  if (a.glb) writeFileSync(path.join(dir, `${name}.glb`), a.glb);
  console.log(`  ${path.basename(dir)} ${name}: mask ${(a.coverage * 100).toFixed(0)}%${a.glb ? `, glb ${(a.glb.length / 1e6).toFixed(1)} MB` : skip3d ? "" : ` 3D FAILED ${a.error}`}`);
};

if (args.includes("--lift-existing")) {
  // Images and masks already exist: only run SAM 3D.
  await Promise.all(
    SEED_MEMBERS.filter((m) => !only || m.id === only).flatMap((m) =>
      FIGURE_POSES.map(async (pose) => {
        const dir = `public/seed/figures/${m.id}`;
        if (!existsSync(`${dir}/${pose}.png`) || existsSync(`${dir}/${pose}.glb`)) return;
        try {
          const r = await reconstruct3d(readFileSync(`${dir}/${pose}.png`), readFileSync(`${dir}/${pose}.mask.png`));
          writeFileSync(`${dir}/${pose}.glb`, r.glb);
          console.log(`  ${m.id} ${pose}: glb ${(r.glb.length / 1e6).toFixed(1)} MB in ${r.ms} ms`);
        } catch (e) {
          console.log(`  ${m.id} ${pose}: 3D FAILED ${(e as Error).message}`);
        }
      }),
    ),
  );
} else if (args.includes("--frames")) {
  // Stop-motion replacement frames from the existing pose images: --frames [talk_a,blink]
  const pick = args[args.indexOf("--frames") + 1];
  const frames = pick && !pick.startsWith("--") ? (pick.split(",") as any[]) : [...FIGURE_FRAMES];
  await Promise.all(
    SEED_MEMBERS.filter((m) => !only || m.id === only).map(async (m) => {
      const dir = `public/seed/figures/${m.id}`;
      const poseImages = Object.fromEntries(FIGURE_POSES.filter((p) => existsSync(`${dir}/${p}.png`)).map((p) => [p, readFileSync(`${dir}/${p}.png`)]));
      await createFigureFrames(poseImages, { skip3d, frames, onFrame: (name, a) => save(dir, a, name) });
    }),
  );
} else if (args.includes("--recut")) {
  // Rebuild the transparent cut-outs from the saved images and SAM masks (no model calls).
  const sharp = (await import("sharp")).default;
  const { applyAlpha } = await import("../src/core/persona");
  for (const m of SEED_MEMBERS.filter((m) => !only || m.id === only))
    for (const pose of [...FIGURE_POSES, ...FIGURE_FRAMES]) {
      const dir = `public/seed/figures/${m.id}`;
      if (!existsSync(`${dir}/${pose}.mask.png`)) continue;
      const { data, info } = await sharp(readFileSync(`${dir}/${pose}.mask.png`)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
      const cut = await applyAlpha(readFileSync(`${dir}/${pose}.png`), new Uint8Array(data), info.width, info.height, 0, 0.5);
      if (cut.png) writeFileSync(`${dir}/${pose}.webp`, cut.png);
      console.log(`  ${m.id} ${pose}: ${cut.width}x${cut.height}`);
    }
} else if (args.includes("--poses")) {
  // Redo some poses from the existing neutral image: --poses away,sad
  const poses = args[args.indexOf("--poses") + 1].split(",") as any[];
  await Promise.all(
    SEED_MEMBERS.filter((m) => !only || m.id === only).map(async (m) => {
      const dir = `public/seed/figures/${m.id}`;
      await createFigurePoses(readFileSync(`${dir}/neutral.png`), { skip3d, poses, onPose: (a) => save(dir, a) });
    }),
  );
} else {
  await Promise.all(
    SEED_MEMBERS.filter((m) => !only || m.id === only).map(async (m) => {
      const dir = `public/seed/figures/${m.id}`;
      mkdirSync(dir, { recursive: true });
      const base = await createFigureBase(m, { skip3d });
      save(dir, base);
      await createFigurePoses(base.image, { skip3d, onPose: (a) => save(dir, a) });
    }),
  );
}
console.log("usd", globalLedger.summary().usd.toFixed(3), JSON.stringify(globalLedger.summary().byOp));
