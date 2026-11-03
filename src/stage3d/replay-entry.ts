// Browser entry for the self-contained replay.html on the 3D stage (bundled by esbuild into an IIFE).
import { createStage, buildTimeline, type PerformItem, type StageMember } from "./engine";

interface ReplayData {
  room: string;
  members: StageMember[];
  items: PerformItem[];
  director: { source: string; attempts: number; log: any[]; flags: string[] };
  receipt: any;
  generatedAt: string;
}
declare global {
  interface Window {
    __SCENE__: ReplayData;
  }
}
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const usd = (v: number) => (v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`);

function main() {
  const data = window.__SCENE__;
  const app = document.getElementById("app")!;
  const phone = el("div", "rp-phone");
  const top = el("div", "rp-top");
  top.append(el("div", "rp-room", data.room), el("div", "rp-sub", `${data.items.length} missed messages`));
  const host = el("div", "rp-stage");
  const bar = el("div", "rp-bar");
  const fill = el("div", "rp-fill");
  bar.append(fill);
  const controls = el("div", "rp-controls");
  const speedBtn = el("button", "rp-btn", "1×");
  const playBtn = el("button", "rp-play", `Play ${data.items.length} missed`);
  const skipBtn = el("button", "rp-btn", "Skip");
  controls.append(speedBtn, playBtn, skipBtn);
  phone.append(top, host, bar, controls);

  const side = el("div", "rp-side");
  side.append(el("h2", "", "How this was made"));
  side.append(el("p", "rp-note", `Directed by ${data.director.source === "spark" ? "Muse Spark 1.3" : "the rule table"}${data.director.attempts ? `, ${data.director.attempts} attempt(s)` : ""}. Every voice line was read back by Muse Voice Transcribe before it could play.`));
  if (data.director.log?.length) {
    const log = el("pre", "rp-log");
    log.textContent = data.director.log
      .map((l: any) => `attempt ${l.attempt}: ${l.ok ? "validate_directions passed" : "rejected: " + l.errors.map((e: any) => `${e.code} ${e.message}`).join("; ")} (${l.ms} ms)`)
      .join("\n");
    side.append(log);
  }
  const lines = el("ol", "rp-lines");
  data.items.forEach((it, i) => {
    const li = el("li");
    li.dataset.i = String(i);
    const who = data.members.find((m) => m.id === it.memberId)?.name ?? it.memberId;
    const rb = it.readback ?? [];
    const last = rb.at(-1);
    const badge =
      it.status === "verified" ? `voice read back ${last ? last.score.toFixed(2) : ""}${rb.length > 1 ? ` on try ${rb.length}` : ""}` : it.status === "silent" ? "emoji, no voice" : "captions only";
    const reacts = (it.reactions ?? []).map((r) => `${data.members.find((m) => m.id === r.memberId)?.name ?? r.memberId} ${r.pose === "away" ? "asleep" : r.pose}`).join(", ");
    li.append(el("b", "", who), el("span", "t", ` ${it.text}`), el("span", "meta", `${it.emotion}, ${it.gesture}, ${it.camera}${reacts ? ` · ${reacts}` : ""} · ${badge}`));
    for (const r of rb.slice(0, -1)) li.append(el("span", "rej", `rejected ${r.score.toFixed(2)}: heard “${r.heard}”`));
    lines.append(li);
  });
  side.append(el("h2", "", "The conversation"), lines);
  const rc = data.receipt;
  if (rc?.byModel) {
    side.append(el("h2", "", "Receipt"));
    const t = el("table", "rp-rec");
    t.innerHTML = "<tr><th>Model</th><th>Calls</th><th>Cost</th></tr>";
    for (const [model, v] of Object.entries<any>(rc.byModel)) {
      const tr = el("tr");
      tr.append(el("td", "", model), el("td", "", String(v.calls)), el("td", "", usd(v.usd)));
      t.append(tr);
    }
    side.append(t, el("p", "rp-note", `${rc.calls} calls, ${usd(rc.usd)} in total.`));
  }
  side.append(el("p", "rp-note", `Generated ${data.generatedAt}.`));
  app.append(phone, side);

  const stage = createStage(host, { members: data.members, viewerId: null });
  let speed = 1;
  let ctl: ReturnType<typeof stage.play> | null = null;
  const total = () => buildTimeline(data.items, speed).at(-1)?.end ?? 1;
  const mark = (i: number) => {
    lines.querySelectorAll("li").forEach((li) => li.classList.toggle("on", li.dataset.i === String(i)));
    fill.style.width = `${Math.round((buildTimeline(data.items, speed)[i].start / total()) * 100)}%`;
  };
  playBtn.onclick = () => {
    stage.unlockAudio();
    ctl?.stop();
    playBtn.textContent = "Playing";
    ctl = stage.play(data.items, { speed, onItem: mark, onEnd: () => ((fill.style.width = "100%"), (playBtn.textContent = "Play again")) });
  };
  speedBtn.onclick = () => {
    speed = speed === 1 ? 1.25 : 1;
    speedBtn.textContent = speed === 1 ? "1×" : "1.25×";
    ctl?.setSpeed(speed);
  };
  skipBtn.onclick = () => ctl?.skip();
  if (new URLSearchParams(location.search).has("autoplay")) setTimeout(() => playBtn.click(), 800);
}
main();
