// Spike: can Muse Image turn a seated figure to a three-quarter view and a side profile, same character?
//   npx tsx scripts/spike-views.ts [figure]   → out/spike-views/<figure>-*.png
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { editImage } from "../src/core/meta";
import { globalLedger } from "../src/core/ledger";

const id = process.argv[2] ?? "mina";
const KEEP = "Same character, same clay style, same wooden stool, same size in the frame, same plain light gray background and soft lighting.";
const views: [string, string][] = [
  ["q3", `${KEEP} The character and the stool are turned 45 degrees so the figure faces toward the right side of the picture: a three-quarter view, still sitting with hands on the knees, looking where the body faces.`],
  ["side", `${KEEP} The character and the stool are turned 90 degrees so the figure faces the right side of the picture: a full side profile view, still sitting with hands on the knees, looking straight ahead to the right.`],
];
const src = readFileSync(`public/seed/figures/${id}/neutral.png`);
await Promise.all(
  views.map(async ([name, prompt]) => {
    const r = await editImage([src], prompt, { op: "spike.view" });
    writeFileSync(`out/spike-views/${id}-${name}.png`, r.bytes);
    console.log(id, name, "ok");
  }),
);
console.log("usd", globalLedger.summary().usd.toFixed(3));
