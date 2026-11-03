// Browser entry for the self-contained replay.html (bundled by esbuild into an IIFE).
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtUsd(v: number) {
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`;
}

function main() {
  const data = window.__SCENE__;
  const app = document.getElementById("app")!;
  const phone = el("div", "rp-phone");
  const top = el("div", "rp-top");
  top.append(el("div", "rp-room", data.room), el("div", "rp-sub", `${data.items.length} missed messages`));
  const stageHost = el("div", "rp-stage");
  const controls = el("div", "rp-controls");
  const playBtn = el("button", "rp-play", `▶ Play ${data.items.length} missed`);
  const speedBtn = el("button", "rp-btn", "1×");
  const skipBtn = el("button", "rp-btn", "Skip ⏭");
  const bar = el("div", "rp-bar");
  const fill = el("div", "rp-fill");
  bar.append(fill);
  controls.append(speedBtn, playBtn, skipBtn);
  phone.append(top, stageHost, bar, controls);

  const side = el("div", "rp-side");
  const dirHead = el("h3", "", "Director · Muse Spark 1.3");
  const dirInfo = el("p", "rp-note", `source: ${data.director.source} · attempts: ${data.director.attempts}${data.director.flags.length ? " · " + data.director.flags.join(", ") : ""}`);
  const dirLog = el("pre", "rp-log");
  dirLog.textContent = data.director.log
    .map((l: any) => `attempt ${l.attempt}: ${l.ok ? "validate_directions ✓" : "✗ " + l.errors.map((e: any) => `${e.code} ${e.message}`).join("; ")}  (${l.ms} ms, in ${l.inputTokens} / out ${l.outputTokens} tok, reasoning ${l.reasoningTokens})`)
    .join("\n");
  const lines = el("ol", "rp-lines");
  data.items.forEach((it, i) => {
    const li = el("li");
    li.dataset.i = String(i);
    const who = data.members.find((m) => m.id === it.memberId)?.name ?? it.memberId;
    const badge = it.status === "verified" ? "✓ read-back" : it.status === "silent" ? "emoji" : it.status === "pending" ? "…" : "captions";
    li.innerHTML = `<b></b> <span class="t"></span><span class="meta"></span>`;
    (li.querySelector("b") as HTMLElement).textContent = who;
    (li.querySelector(".t") as HTMLElement).textContent = it.text;
    (li.querySelector(".meta") as HTMLElement).textContent = `${it.emotion} · ${it.gesture} · ${it.camera} · ${it.pauseMs}ms · ${badge}`;
    lines.append(li);
  });
  const rc = data.receipt;
  const recHead = el("h3", "", "Receipt");
  const rec = el("table", "rp-rec");
  rec.innerHTML = `<tr><th>model</th><th>calls</th><th>$</th><th>ms</th></tr>`;
  for (const [model, v] of Object.entries<any>(rc?.byModel ?? {})) {
    const tr = el("tr");
    tr.innerHTML = `<td></td><td>${v.calls}</td><td>${fmtUsd(v.usd)}</td><td>${Math.round(v.ms)}</td>`;
    (tr.firstChild as HTMLElement).textContent = model;
    rec.append(tr);
  }
  const tot = el("p", "rp-note", rc ? `total ${rc.calls} calls · ${fmtUsd(rc.usd)}` : "");
  side.append(dirHead, dirInfo, dirLog, lines, recHead, rec, tot, el("p", "rp-note", `generated ${data.generatedAt}`));
  app.append(phone, side);

  const stage = createStage(stageHost, { members: data.members, viewerId: null });
  let speed = 1;
  let ctl: ReturnType<typeof stage.play> | null = null;
  const timeline = () => buildTimeline(data.items, speed);
  const total = () => timeline().at(-1)?.end ?? 1;
  const mark = (i: number) => {
    lines.querySelectorAll("li").forEach((li) => li.classList.toggle("on", li.dataset.i === String(i)));
    const t = timeline()[i];
    fill.style.width = `${Math.round((t.start / total()) * 100)}%`;
  };
  playBtn.onclick = () => {
    stage.unlockAudio();
    ctl?.stop();
    playBtn.textContent = "Playing…";
    ctl = stage.play(data.items, {
      speed,
      onItem: (i) => mark(i),
      onEnd: () => {
        fill.style.width = "100%";
        playBtn.textContent = "↺ Replay";
      },
    });
  };
  speedBtn.onclick = () => {
    speed = speed === 1 ? 1.25 : 1;
    speedBtn.textContent = speed === 1 ? "1×" : "1.25×";
    ctl?.setSpeed(speed);
  };
  skipBtn.onclick = () => ctl?.skip();
  if (new URLSearchParams(location.search).has("autoplay")) setTimeout(() => playBtn.click(), 600);
}

main();
