// Replacement heads for the seed cast: two talking views (Muse Image edits of the three-quarter and side views),
// then every picture's head cut out with SAM 3.1 (src/core/heads.ts).
//   npx tsx scripts/make-heads.ts [--redo]   → public/seed/figures/<id>/<pic>.head.webp, q3_talk.*, side_talk.*
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { editImage } from "../src/core/meta";
import { maskFigure, FRAME_EDITS } from "../src/core/figure";
import { headLayer, HEAD_SKIP } from "../src/core/heads";
import { Ledger } from "../src/core/ledger";

const ledger = new Ledger();
const redo = process.argv.includes("--redo");
for (const id of ["sam", "mina", "jay"]) {
  const dir = `public/seed/figures/${id}`;
  for (const name of ["q3_talk", "side_talk"] as const) {
    if (existsSync(`${dir}/${name}.webp`) && !redo) continue;
    const { from, prompt } = FRAME_EDITS[name];
    const edited = await editImage([readFileSync(`${dir}/${from}.png`)], prompt, { op: "figure.frame", ledger });
    const m = await maskFigure(edited.bytes, { ledger });
    writeFileSync(`${dir}/${name}.png`, edited.bytes);
    writeFileSync(`${dir}/${name}.webp`, m.cutout);
    writeFileSync(`${dir}/${name}.mask.png`, m.mask);
    console.log(id, name, "made");
  }
  const pics = readdirSync(dir).filter((f) => /^[a-z0-9_]+\.webp$/.test(f) && !f.includes(".head")).map((f) => f.replace(".webp", ""));
  await Promise.all(
    pics
      .filter((p) => !HEAD_SKIP.has(p) && existsSync(`${dir}/${p}.png`) && (redo || !existsSync(`${dir}/${p}.head.webp`)))
      .map(async (p) => {
        const head = await headLayer(readFileSync(`${dir}/${p}.png`), readFileSync(`${dir}/${p}.webp`), { ledger });
        if (head) writeFileSync(`${dir}/${p}.head.webp`, head);
        console.log(id, p, head ? `head ${(head.length / 1024).toFixed(0)} KB` : "no head");
      }),
  );
}
console.log(`$${ledger.entries.reduce((a, e) => a + e.usd, 0).toFixed(3)}`, ledger.entries.length, "calls");
