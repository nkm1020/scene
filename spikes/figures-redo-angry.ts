import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createFigurePoses } from "../src/core/figure";
for (const id of ["jay"]) {
  const dir = `public/seed/figures/${id}`;
  const [a] = await createFigurePoses(readFileSync(`${dir}/neutral.png`), { skip3d: !process.env.FAL_KEY, poses: ["angry"] });
  if (!a.image.length) { console.log(id, "FAILED", a.error); continue; }
  writeFileSync(`${dir}/angry.png`, a.image); writeFileSync(`${dir}/angry.webp`, a.cutout); writeFileSync(`${dir}/angry.mask.png`, a.mask);
  if (a.glb) writeFileSync(`${dir}/angry.glb`, a.glb);
  console.log(id, "angry ok", (a.coverage * 100).toFixed(0) + "%");
}
