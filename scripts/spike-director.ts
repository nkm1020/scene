import "dotenv/config";
import { directSegment } from "../src/core/director";
import { SEED_MESSAGES } from "../src/core/seed";
import { globalLedger } from "../src/core/ledger";
const effort = (process.argv[2] ?? "low") as any;
const roster = [
  { member_id: "sam", name: "Sam", present: true },
  { member_id: "mina", name: "Mina", present: true },
  { member_id: "jay", name: "Jay", present: false },
];
const run = await directSegment(SEED_MESSAGES, { ledger: globalLedger, reasoningEffort: effort, roster });
console.log(JSON.stringify({ effort, source: run.source, attempts: run.attempts, log: run.log.map((l) => ({ ok: l.ok, ms: l.ms, out: l.outputTokens, errors: l.errors.slice(0, 3) })) }));
for (const d of run.directions) {
  const m = SEED_MESSAGES.find((x) => x.id === d.message_id)!;
  console.log(`${d.message_id} ${m.sender_name?.padEnd(4)} ${d.emotion}/${d.gesture}/${d.camera}/${d.pause_ms} "${m.text}"  ⟶ ${(d.reactions ?? []).map((r) => `${r.member_id}:${r.pose}@${r.look}`).join("  ")}`);
}
console.log("usd", globalLedger.summary().usd.toFixed(4));
