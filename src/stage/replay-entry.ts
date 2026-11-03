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
    const rb = it.readback ?? [];
    const last = rb.at(-1);
    const badge =
      it.status === "verified"
        ? `✓ read-back ${last ? last.score.toFixed(2) : ""}${rb.length > 1 ? ` (try ${rb.length})` : ""}`
        : it.status === "silent"
          ? "emoji · no voice"
          : it.status === "pending"
            ? "…"
            : "captions";
    li.innerHTML = `<b></b> <span class="t"></span><span class="meta"></span>`;
    (li.querySelector("b") as HTMLElement).textContent = who;
    (li.querySelector(".t") as HTMLElement).textContent = it.text;
    (li.querySelector(".meta") as HTMLElement).textContent = `${it.emotion} · ${it.gesture} · ${it.camera} · ${it.pauseMs}ms · ${badge}`;
    for (const r of rb.slice(0, -1)) {
      const rej = el("span", "rej");
      rej.textContent = `✗ rejected ${r.score.toFixed(2)} — heard “${r.heard}”`;
      li.append(rej);
    }
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

  // Glasses view (?glasses): the same stage, screen-blended into a display lens over the real world.
  if (new URLSearchParams(location.search).has("glasses")) {
    document.body.classList.add("glasses");
    const world = el("div", "gl-world");
    const frame = el("div", "gl-frame");
    frame.innerHTML = `<svg viewBox="0 0 1000 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><linearGradient id="lens" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></linearGradient></defs>
      <path d="M40 120 Q40 70 100 64 L410 60 Q470 60 470 120 L462 260 Q455 350 360 356 L150 360 Q60 360 52 270 Z" fill="url(#lens)" stroke="#0a0a0a" stroke-width="34"/>
      <path d="M960 120 Q960 70 900 64 L590 60 Q530 60 530 120 L538 260 Q545 350 640 356 L850 360 Q940 360 948 270 Z" fill="url(#lens)" stroke="#0a0a0a" stroke-width="34"/>
      <path d="M470 120 Q500 92 530 120" fill="none" stroke="#0a0a0a" stroke-width="30"/>
      <path d="M40 110 L0 96" stroke="#0a0a0a" stroke-width="30"/><path d="M960 110 L1000 96" stroke="#0a0a0a" stroke-width="30"/></svg>`;
    const hud = el("div", "gl-hud");
    const note = el("div", "gl-note", "Same group chat, seen through a display lens. Mock-up: rendered in a browser.");
    stageHost.classList.add("gl-stage");
    hud.append(stageHost);
    document.body.append(world, hud, frame, note);
    const style = document.createElement("style");
    style.textContent = `
      body.glasses #app .rp-phone{display:none}
      body.glasses{overflow:hidden}
      .gl-world{position:fixed;inset:0;background:
        radial-gradient(40% 30% at 22% 30%,rgba(255,214,150,.55),transparent 70%),
        radial-gradient(30% 25% at 78% 26%,rgba(255,190,120,.45),transparent 70%),
        radial-gradient(60% 40% at 50% 100%,rgba(120,80,50,.8),transparent 70%),
        linear-gradient(#6b5642,#2e231b);filter:blur(6px) saturate(1.1)}
      .gl-world::after{content:"";position:absolute;left:8%;right:8%;bottom:6%;height:24%;border-radius:50%/40%;background:radial-gradient(closest-side,rgba(60,38,24,.9),rgba(60,38,24,0))}
      .gl-frame{position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:3}
      .gl-frame svg{width:min(100vw,160vh);height:auto;filter:drop-shadow(0 20px 40px rgba(0,0,0,.5))}
      body.glasses{--gw:min(100vw,160vh)}
      .gl-hud{position:fixed;z-index:2;left:50%;top:50%;width:calc(var(--gw)*0.36);aspect-ratio:4/3;transform:translate(calc(var(--gw)*0.245 - 50%),-50%);
        mix-blend-mode:screen;border-radius:18px;overflow:hidden}
      .gl-hud .gl-stage{position:absolute;inset:0}
      .gl-hud .sc-stage{background:#000}
      .gl-hud .sc-room,.gl-hud .sc-floor,.gl-hud .sc-vignette,.gl-hud .sc-scanall{display:none}
      .gl-hud .sc-table{opacity:.55}
      .gl-hud .sc-caption .line{background:rgba(0,0,0,.6);font-size:clamp(12px,1.6vw,18px)}
      .gl-hud .sc-mark{top:6px;right:8px;font-size:8px}
      .gl-note{position:fixed;left:16px;bottom:12px;z-index:4;font-size:11px;color:rgba(255,255,255,.55)}
      body.glasses .rp-side{position:fixed;right:-9999px}
      body.glasses .gl-ctl{position:fixed;z-index:5;left:50%;bottom:18px;transform:translateX(-50%)}
    `;
    document.head.append(style);
    controls.classList.add("gl-ctl");
    document.body.append(controls);
  }

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
