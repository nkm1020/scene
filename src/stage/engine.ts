// Scene stage: a dark room where members sit in a circle and perform messages as holograms.
// Framework-free DOM so the web app and the exported replay.html share one implementation.
// Time is a pure function of (items, durations, pauses, speed): see buildTimeline().

import { STAGE_CSS } from "./styles";

export type Emotion = "neutral" | "happy" | "surprised" | "angry" | "sad" | "laughing";
export type Gesture = "none" | "lean_in" | "step_back" | "shake" | "nod";
export type Camera = "room" | "close";

export interface StageMember {
  id: string;
  name: string;
  personaUrl: string | null;
  /** Same persona with head bowed (Muse Image edit). Shown while the member is away. */
  awayUrl?: string | null;
  present: boolean;
}

export interface PerformItem {
  messageId: string;
  memberId: string;
  text: string;
  emotion: Emotion;
  gesture: Gesture;
  camera: Camera;
  pauseMs: number;
  audioUrl?: string | null;
  envelope?: number[]; // RMS 0..1 at 30 fps
  durationMs?: number; // audio duration when verified
  status?: "verified" | "captions_only" | "silent" | "pending";
  flags?: string[];
}

export interface TimelineEntry {
  index: number;
  start: number; // ms from segment start (after the pause)
  end: number;
  item: PerformItem;
}

const ENV_FPS = 30;
const TABLE_Y = 68; // % of stage height (table center)
const TABLE_H = 19; // % of stage height

export function itemDuration(item: PerformItem): number {
  if (item.status === "verified" && item.durationMs) return item.durationMs;
  if (item.status === "silent") return 1100;
  const chars = [...item.text].length;
  return Math.max(1300, Math.min(4800, chars * 70));
}

/** Pure schedule: when each message starts and ends at a given speed. */
export function buildTimeline(items: PerformItem[], speed = 1): TimelineEntry[] {
  let t = 0;
  return items.map((item, index) => {
    t += item.pauseMs / speed;
    const start = t;
    t += itemDuration(item) / speed + 250 / speed; // short tail so lines don't collide
    return { index, start, end: t, item };
  });
}

export const DEFAULT_PERSONA =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 368"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfefff"/><stop offset="1" stop-color="#4fb6ff"/></linearGradient></defs><g fill="url(#g)" stroke="#0b2a44" stroke-width="7"><circle cx="150" cy="118" r="78"/><path d="M28 362c6-92 58-142 122-142s116 50 122 142z"/></g><g fill="#0b2a44"><circle cx="124" cy="122" r="8"/><circle cx="176" cy="122" r="8"/></g><path d="M128 156q22 14 44 0" fill="none" stroke="#0b2a44" stroke-width="7" stroke-linecap="round"/></svg>`,
  );

const EMOTE_SVG: Record<Exclude<Emotion, "neutral">, string> = {
  happy: `<svg viewBox="0 0 100 100"><g fill="#bff6ff" stroke="#7fe3ff" stroke-width="3"><path d="M30 12l6 16 16 6-16 6-6 16-6-16-16-6 16-6z"/><path d="M70 46l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/></g></svg>`,
  surprised: `<svg viewBox="0 0 100 100"><g fill="#fff6b0" stroke="#ffd34d" stroke-width="4" stroke-linejoin="round"><path d="M40 8h22l-5 54H45z"/><circle cx="51" cy="80" r="9"/></g></svg>`,
  angry: `<svg viewBox="0 0 100 100"><g fill="none" stroke="#ff5a6e" stroke-width="9" stroke-linecap="round"><path d="M22 40q14 0 16-18"/><path d="M60 22q2 18 18 18"/><path d="M78 60q-16 0-18 18"/><path d="M38 78q-2-18-16-18"/></g></svg>`,
  sad: `<svg viewBox="0 0 100 100"><path d="M50 10C40 34 28 48 28 64a22 22 0 0 0 44 0c0-16-12-30-22-54z" fill="#9fd4ff" stroke="#3aa8ff" stroke-width="4"/></svg>`,
  laughing: `<svg viewBox="0 0 120 100"><g fill="#fff6b0" stroke="#ffd34d" stroke-width="3" font-family="system-ui,sans-serif" font-weight="900"><text x="4" y="52" font-size="40" transform="rotate(-12 30 40)">HA</text><text x="48" y="92" font-size="34" transform="rotate(8 70 80)">HA</text></g></svg>`,
};

interface Seat {
  member: StageMember;
  el: HTMLDivElement;
  persona: HTMLDivElement;
  pulse: HTMLDivElement;
  emote: HTMLDivElement;
  x: number; // % of stage width (center)
  y: number; // % of stage height (feet)
  s: number; // depth scale
  depth: number;
  self?: boolean;
}

export interface StageOptions {
  members: StageMember[];
  viewerId?: string | null;
  showMark?: boolean;
  /** No sound effects and no voice flags (landing-page preview). */
  quiet?: boolean;
}

export interface PlayController {
  done: Promise<void>;
  skip(): void;
  stop(): void;
  setSpeed(s: number): void;
  readonly index: number;
}

let cssInjected = false;
function injectCss(doc: Document) {
  if (cssInjected && doc.getElementById("sc-stage-css")) return;
  const style = doc.createElement("style");
  style.id = "sc-stage-css";
  style.textContent = STAGE_CSS;
  doc.head.appendChild(style);
  cssInjected = true;
}

const wait = (ms: number, signal?: { cancelled: boolean; skip: boolean }) =>
  new Promise<void>((resolve) => {
    const t0 = performance.now();
    // Timer-based (not rAF) so a hidden tab still advances its queue.
    const tick = () => {
      if (signal?.cancelled || signal?.skip || performance.now() - t0 >= ms) return resolve();
      setTimeout(tick, Math.min(50, Math.max(1, ms - (performance.now() - t0))));
    };
    tick();
  });

export class Stage {
  root: HTMLDivElement;
  private cam: HTMLDivElement;
  private seats = new Map<string, Seat>();
  private caption: HTMLDivElement;
  private viewerId: string | null;
  private members: StageMember[];
  private audioCtx: AudioContext | null = null;
  private current: { cancelled: boolean; skip: boolean; speed: number } | null = null;
  private quiet = false;

  constructor(container: HTMLElement, opts: StageOptions) {
    injectCss(container.ownerDocument);
    this.viewerId = opts.viewerId ?? null;
    this.members = opts.members;
    this.quiet = !!opts.quiet;
    const root = document.createElement("div");
    root.className = "sc-stage";
    root.innerHTML = `<div class="sc-room"></div><div class="sc-floor"></div><div class="sc-cam"></div>
      <div class="sc-vignette"></div><div class="sc-scanall"></div>
      <div class="sc-caption hidden"><div class="who"></div><div class="line"></div><span class="flag"></span></div>
      ${opts.showMark === false ? "" : `<div class="sc-mark">AI-MADE · SCENE</div>`}`;
    container.appendChild(root);
    this.root = root;
    this.cam = root.querySelector(".sc-cam") as HTMLDivElement;
    this.caption = root.querySelector(".sc-caption") as HTMLDivElement;
    this.layout();
    new ResizeObserver(() => this.place()).observe(root);
  }

  /** Members on the arc = everyone except the viewer (the viewer's seat is the camera). */
  private arcMembers(): StageMember[] {
    return this.members.filter((m) => m.id !== this.viewerId);
  }

  setMembers(members: StageMember[]) {
    const prev = new Map(this.members.map((m) => [m.id, m]));
    this.members = members;
    const sameSet =
      members.length === prev.size &&
      members.every((m) => prev.has(m.id) && prev.get(m.id)!.personaUrl === m.personaUrl && (prev.get(m.id)!.awayUrl ?? null) === (m.awayUrl ?? null) && prev.get(m.id)!.name === m.name);
    if (!sameSet) this.layout();
    for (const m of members) this.setPresence(m.id, m.present);
  }

  private layout() {
    this.cam.innerHTML = `<div class="sc-table"></div>`;
    this.seats.clear();
    const arc = this.arcMembers();
    const n = arc.length;
    arc.forEach((member, i) => {
      // Seats sit on the far rim of an elliptical table; the viewer's seat (near rim) is the camera.
      const angle = n === 1 ? Math.PI / 2 : Math.PI - (i * Math.PI) / (n - 1) * 0.84 - Math.PI * 0.08;
      const depth = Math.sin(angle); // 1 = far middle
      const x = 50 - (n <= 3 ? 32 : 37) * Math.cos(angle);
      const y = TABLE_Y - TABLE_H * 0.5 * depth + 4; // feet just behind the rim (hidden by the table top)
      const s = 1 - 0.16 * depth;
      const el = document.createElement("div");
      el.className = `sc-seat ${member.present ? "present" : "absent"}${member.awayUrl ? " has-away" : ""}`;
      el.dataset.member = member.id;
      const url = member.personaUrl || DEFAULT_PERSONA;
      el.innerHTML = `<div class="sc-beam"></div><div class="sc-disc"></div>
        <div class="sc-persona sc-flicker"><div class="sc-pulse">
          <div class="sc-pose here">
            <div class="sc-layer body"><img class="sc-img" alt="" draggable="false"><div class="sc-scan"></div></div>
            <div class="sc-layer head"><img class="sc-img" alt="" draggable="false"><div class="sc-scan"></div></div>
          </div>
          ${member.awayUrl ? `<div class="sc-pose away"><img class="sc-img" alt="" draggable="false"><div class="sc-scan"></div></div>` : ""}
        </div><div class="sc-emote"></div><div class="sc-dots">•••</div></div>
        <div class="sc-name"></div>`;
      const setImg = (scope: Element, u: string) => {
        scope.querySelectorAll<HTMLImageElement>("img").forEach((img) => (img.src = u));
        scope.querySelectorAll<HTMLDivElement>(".sc-scan").forEach((d) => {
          d.style.maskImage = `url("${u}")`;
          (d.style as any).webkitMaskImage = `url("${u}")`;
        });
      };
      setImg(el.querySelector(".sc-pose.here")!, url);
      if (member.awayUrl) setImg(el.querySelector(".sc-pose.away")!, member.awayUrl);
      (el.querySelector(".sc-name") as HTMLDivElement).textContent = member.name;
      this.cam.appendChild(el);
      this.seats.set(member.id, {
        member,
        el,
        persona: el.querySelector(".sc-persona") as HTMLDivElement,
        pulse: el.querySelector(".sc-pulse") as HTMLDivElement,
        emote: el.querySelector(".sc-emote") as HTMLDivElement,
        x,
        y,
        s,
        depth,
      });
    });
    // The viewer's own seat is the camera. Their persona appears only as a small mirror (bottom-left)
    // while their own message plays, so a person alone in a room still sees and hears how friends get it.
    const me = this.members.find((m) => m.id === this.viewerId);
    if (me) {
      const el = document.createElement("div");
      el.className = "sc-seat self present";
      el.dataset.member = me.id;
      const url = me.personaUrl || DEFAULT_PERSONA;
      el.innerHTML = `<div class="sc-disc"></div><div class="sc-persona"><div class="sc-pulse"><div class="sc-pose here">
        <div class="sc-layer body"><img class="sc-img" alt="" draggable="false"></div>
        <div class="sc-layer head"><img class="sc-img" alt="" draggable="false"></div></div></div><div class="sc-emote"></div></div>
        <div class="sc-name">You · as friends hear it</div>`;
      el.querySelectorAll<HTMLImageElement>("img").forEach((img) => (img.src = url));
      this.cam.parentElement!.appendChild(el); // outside the camera rig: never zoomed
      this.selfSeat?.el.remove();
      this.selfSeat = { member: me, el, persona: el.querySelector(".sc-persona") as HTMLDivElement, pulse: el.querySelector(".sc-pulse") as HTMLDivElement, emote: el.querySelector(".sc-emote") as HTMLDivElement, x: 17, y: 88, s: 0.62, depth: 0, self: true };
    } else {
      this.selfSeat?.el.remove();
      this.selfSeat = null;
    }
    this.place();
  }

  private selfSeat: Seat | null = null;

  private place() {
    const w = this.root.clientWidth || 360;
    const h = this.root.clientHeight || 640;
    const n = Math.max(1, this.seats.size);
    const base = Math.min(w * (n <= 2 ? 0.5 : n === 3 ? 0.42 : n === 4 ? 0.29 : n === 5 ? 0.25 : 0.21), h * 0.4);
    this.root.style.setProperty("--table-y", `${TABLE_Y}%`);
    this.root.style.setProperty("--table-h", `${TABLE_H}%`);
    const all = [...this.seats.values(), ...(this.selfSeat ? [this.selfSeat] : [])];
    for (const seat of all) {
      if (seat.self) {
        seat.el.style.width = `${base * seat.s}px`;
        seat.el.style.left = `${seat.x}%`;
        seat.el.style.top = `${seat.y}%`;
        seat.el.style.transform = "translate(-50%,-100%)";
        continue;
      }
      const speaking = seat.el.classList.contains("speaking");
      const g = seat.el.dataset.gesture;
      let k = speaking ? 1.12 : 1;
      let dy = speaking ? TABLE_H * 0.9 : 0; // step forward over the table
      if (speaking && g === "lean_in") { k *= 1.06; dy += 2; }
      if (speaking && g === "step_back") { k *= 0.94; dy -= 2; }
      seat.el.style.width = `${base * seat.s}px`;
      seat.el.style.left = `${seat.x}%`;
      seat.el.style.top = `${seat.y + dy}%`;
      seat.el.style.transform = `translate(-50%,-100%) scale(${k})`;
      seat.el.style.zIndex = String(speaking ? 12 : Math.round((1 - seat.depth) * 6) + 1);
    }
  }

  setPresence(memberId: string, present: boolean) {
    const seat = this.seats.get(memberId);
    if (!seat) return;
    seat.member.present = present;
    if (seat.el.classList.contains("speaking")) return; // restored after the line
    seat.el.classList.toggle("absent", !present);
    seat.el.classList.toggle("present", present);
  }

  setWaiting(memberId: string, on: boolean) {
    this.seats.get(memberId)?.el.classList.toggle("waiting", on);
  }

  private ctx(): AudioContext | null {
    try {
      this.audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /** Call from a user gesture so later audio can play. */
  unlockAudio() {
    this.ctx();
  }

  private blip(kind: "ding" | "type", durationMs: number) {
    if (this.quiet) return;
    const ctx = this.ctx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (kind === "ding") {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(1320, now);
      o.frequency.exponentialRampToValueAtTime(880, now + 0.25);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(now);
      o.stop(now + 0.65);
      return;
    }
    const clicks = Math.floor(durationMs / 95);
    for (let i = 0; i < clicks; i++) {
      const t = now + i * 0.095 + Math.random() * 0.03;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(1800 + Math.random() * 600, t);
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.035);
    }
  }

  private showCaption(item: PerformItem) {
    const who = item.memberId === this.viewerId ? "You" : this.members.find((m) => m.id === item.memberId)?.name ?? "";
    (this.caption.querySelector(".who") as HTMLElement).textContent = who;
    (this.caption.querySelector(".line") as HTMLElement).textContent = item.text;
    const flag = this.caption.querySelector(".flag") as HTMLElement;
    flag.textContent = this.quiet ? "" : item.status === "captions_only" ? (item.flags?.includes("voice_disabled") ? "captions only" : "voice not verified · captions only") : "";
    this.caption.classList.remove("hidden");
  }

  hideCaption() {
    this.caption.classList.add("hidden");
  }

  private focusCamera(seat: Seat | null, camera: Camera) {
    if (!seat || camera !== "close") {
      this.cam.style.transform = "";
      return;
    }
    // Pan the speaker toward the center, then zoom a little (keeps side seats in frame).
    const z = 1.2;
    const tx = (50 - seat.x) * 0.9;
    const ty = Math.max(-6, (58 - seat.y) * 0.5);
    this.cam.style.transformOrigin = "50% 55%";
    this.cam.style.transform = `translate(${tx}%, ${ty}%) scale(${z})`;
  }

  /** Perform one line. Resolves when the line (audio or caption time) ends. */
  async perform(item: PerformItem, opts: { speed?: number; signal?: { cancelled: boolean; skip: boolean } } = {}): Promise<void> {
    const speed = opts.speed ?? 1;
    const signal = opts.signal ?? { cancelled: false, skip: false };
    (window as any).__sceneLog ??= [];
    (window as any).__sceneLog.push({ t: Date.now(), id: item.messageId, member: item.memberId, status: item.status, text: item.text.slice(0, 40) });
    const seat = this.seats.get(item.memberId) ?? (this.selfSeat && item.memberId === this.viewerId ? this.selfSeat : null);
    const wasAbsent = seat && !seat.self ? !seat.member.present : false;
    for (const s of this.seats.values()) s.el.classList.toggle("dimmed", s !== seat);
    if (seat) {
      seat.el.classList.remove("absent", "waiting");
      seat.el.classList.add("present", "speaking", `emo-${item.emotion}`);
      if (item.gesture === "nod") seat.el.classList.add("g-nod");
      if (item.gesture === "shake") seat.el.classList.add("g-shake");
      seat.el.dataset.gesture = item.gesture;
      const icon = item.emotion !== "neutral" ? EMOTE_SVG[item.emotion] : "";
      seat.emote.innerHTML = icon;
      seat.emote.classList.toggle("on", !!icon);
      this.place();
    }
    this.focusCamera(seat?.self ? null : seat, item.camera);
    this.showCaption(item);
    const dur = itemDuration(item) / speed;
    let audio: HTMLAudioElement | null = null;
    if (item.status === "verified" && item.audioUrl) {
      audio = new Audio(item.audioUrl);
      audio.playbackRate = speed;
      (audio as any).preservesPitch = true;
      try {
        await audio.play();
      } catch {
        audio = null; // autoplay blocked: fall back to timed caption
      }
    } else if (item.status === "silent") this.blip("ding", dur);
    else this.blip("type", Math.min(dur, 2400));

    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (signal.cancelled || signal.skip) return resolve();
        const elapsed = audio ? audio.currentTime * 1000 : (performance.now() - t0) * speed;
        if (seat && item.envelope?.length) {
          const v = item.envelope[Math.min(item.envelope.length - 1, Math.floor((elapsed / 1000) * ENV_FPS))] ?? 0;
          seat.pulse.style.transform = `scale(${1 + 0.06 * v})`;
        }
        const ended = audio ? audio.ended || (audio.paused && audio.currentTime > 0) : performance.now() - t0 >= dur;
        if (ended) return resolve();
        setTimeout(tick, 33);
      };
      setTimeout(tick, 0);
    });
    if (audio && !audio.ended) audio.pause();
    if (seat) {
      seat.pulse.style.transform = "";
      seat.el.classList.remove("speaking", `emo-${item.emotion}`, "g-nod", "g-shake");
      delete seat.el.dataset.gesture;
      seat.emote.classList.remove("on");
      if (wasAbsent && !seat.member.present) {
        seat.el.classList.remove("present");
        seat.el.classList.add("absent");
      }
      this.place();
    }
  }

  /** Perform a sequence with pauses. Returns a controller (skip/stop/speed). */
  play(items: PerformItem[], opts: { speed?: number; startIndex?: number; onItem?: (i: number, item: PerformItem) => void; onEnd?: () => void } = {}): PlayController {
    this.current && (this.current.cancelled = true);
    const state = { cancelled: false, skip: false, speed: opts.speed ?? 1, index: opts.startIndex ?? 0 };
    this.current = state;
    const done = (async () => {
      for (let i = state.index; i < items.length; i++) {
        if (state.cancelled) break;
        state.index = i;
        const item = items[i];
        await wait(item.pauseMs / state.speed, state);
        if (state.cancelled) break;
        state.skip = false;
        opts.onItem?.(i, item);
        await this.perform(item, { speed: state.speed, signal: state });
        state.skip = false;
      }
      for (const s of this.seats.values()) s.el.classList.remove("dimmed");
      this.focusCamera(null, "room");
      if (!state.cancelled) {
        this.hideCaption();
        opts.onEnd?.();
      }
    })();
    return {
      done,
      skip: () => (state.skip = true),
      stop: () => {
        state.cancelled = true;
      },
      setSpeed: (s: number) => (state.speed = s),
      get index() {
        return state.index;
      },
    };
  }

  destroy() {
    this.current && (this.current.cancelled = true);
    this.selfSeat?.el.remove();
    this.root.remove();
  }
}

export function createStage(container: HTMLElement, opts: StageOptions): Stage {
  return new Stage(container, opts);
}
