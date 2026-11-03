// Scene stage in 3D: friends are clay figurines (SAM 3D meshes) standing on a round wooden table.
// The speaker walks to the front and performs; listeners turn and react as the director says.
// Same public API as the 2D stage so the web app and replay.html can use either.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type Emotion = "neutral" | "happy" | "surprised" | "angry" | "sad" | "laughing";
export type Gesture = "none" | "lean_in" | "step_back" | "shake" | "nod";
export type Camera = "room" | "close";
export type Pose = Emotion | "away";
export type Look = "speaker" | "camera" | "down";

export interface FigureAssets {
  [pose: string]: { glb?: string | null; img?: string | null } | undefined;
}

export interface StageMember {
  id: string;
  name: string;
  personaUrl?: string | null;
  awayUrl?: string | null;
  figure?: FigureAssets | null;
  present: boolean;
}

export interface Reaction {
  memberId: string;
  pose: Pose;
  look?: Look;
}

export interface PerformItem {
  messageId: string;
  memberId: string;
  text: string;
  emotion: Emotion;
  gesture: Gesture;
  camera: Camera;
  pauseMs: number;
  reactions?: Reaction[];
  audioUrl?: string | null;
  envelope?: number[];
  durationMs?: number;
  status?: "verified" | "captions_only" | "silent" | "pending";
  flags?: string[];
  readback?: { score: number; heard: string }[];
}

export interface TimelineEntry {
  index: number;
  start: number;
  end: number;
  item: PerformItem;
}

export function itemDuration(item: PerformItem): number {
  if (item.status === "verified" && item.durationMs) return item.durationMs;
  if (item.status === "silent") return 1100;
  return Math.max(1300, Math.min(4800, [...item.text].length * 70));
}

export function buildTimeline(items: PerformItem[], speed = 1): TimelineEntry[] {
  let t = 0;
  return items.map((item, index) => {
    t += item.pauseMs / speed;
    const start = t;
    t += itemDuration(item) / speed + 600 / speed; // walk on/off
    return { index, start, end: t, item };
  });
}

export interface StageOptions {
  members: StageMember[];
  viewerId?: string | null;
  quiet?: boolean;
  showMark?: boolean;
}

export interface PlayController {
  done: Promise<void>;
  skip(): void;
  stop(): void;
  setSpeed(s: number): void;
  readonly index: number;
}

// ───────────────────────── look & feel ─────────────────────────

const ROOM = "#d9d1c4";
const INK = "#1b1815";
const TABLE_R = 1;
const FIG_H = 0.46;
const SEAT_R = 0.66;
const FRONT = new THREE.Vector3(0, 0, 0.32); // where a speaker stands
const ENV_FPS = 30;

const CSS = `
.s3-root{position:relative;width:100%;height:100%;min-height:360px;overflow:hidden;background:${ROOM};font-family:"Hanken Grotesk",ui-sans-serif,system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;color:${INK};user-select:none;-webkit-user-select:none}
.s3-root canvas{display:block;width:100%!important;height:100%!important}
.s3-cap{position:absolute;left:14px;right:14px;bottom:14px;background:#fff;padding:12px 14px 13px;transition:opacity .25s ease,transform .25s ease}
.s3-cap.hidden{opacity:0;transform:translateY(8px)}
.s3-cap .who{font-size:13px;font-weight:600;color:#6b6259}
.s3-cap .line{font-size:clamp(19px,4.4vw,26px);line-height:1.22;font-weight:700;letter-spacing:-.01em;margin-top:2px}
.s3-cap .flag{font-size:12px;color:#8a5a00;margin-top:4px}
.s3-mark{position:absolute;top:10px;right:12px;font-size:11px;color:#6b6259}
.s3-name{position:absolute;transform:translate(-50%,0);font-size:12px;font-weight:600;color:#4a433c;white-space:nowrap;pointer-events:none;transition:opacity .3s}
.s3-name.away{color:#9a9087}
@media (prefers-reduced-motion:reduce){.s3-cap{transition:none}}
`;

let cssDone = false;
function injectCss(doc: Document) {
  if (cssDone && doc.getElementById("s3-css")) return;
  const s = doc.createElement("style");
  s.id = "s3-css";
  s.textContent = CSS;
  doc.head.appendChild(s);
  cssDone = true;
}

function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#a66d3c";
  g.fillRect(0, 0, 1024, 1024);
  // planks
  for (let p = 0; p < 6; p++) {
    const x0 = (p * 1024) / 6;
    g.fillStyle = `rgba(${90 + p * 7},${55 + p * 4},${28},${0.08 + (p % 2) * 0.05})`;
    g.fillRect(x0, 0, 1024 / 6, 1024);
    g.fillStyle = "rgba(60,35,18,.35)";
    g.fillRect(x0, 0, 2, 1024);
  }
  // grain
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * 1024;
    const w = 0.6 + Math.random() * 1.6;
    g.strokeStyle = `rgba(70,40,18,${0.04 + Math.random() * 0.08})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 1024; y += 32) g.lineTo(x + Math.sin(y / 90 + i) * 4, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const POSE_FALLBACK: Record<Pose, Pose[]> = {
  neutral: [],
  happy: ["laughing", "neutral"],
  laughing: ["happy", "neutral"],
  surprised: ["neutral"],
  angry: ["surprised", "sad", "neutral"],
  sad: ["away", "neutral"],
  away: ["sad", "neutral"],
};

// ───────────────────────── figures ─────────────────────────

interface Figure {
  member: StageMember;
  group: THREE.Group; // positioned on the table
  body: THREE.Group; // squash/hop/tilt happen here
  poses: Map<Pose, THREE.Object3D>;
  current: Pose;
  seat: THREE.Vector3;
  pos: THREE.Vector3; // animated position
  target: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  hopT: number; // seconds since hop start (−1 = none)
  squash: number;
  breathe: boolean;
  gesture: Gesture;
  gestureT: number;
  dim: number;
  targetDim: number;
  label: HTMLDivElement;
  self?: boolean;
  materials: { m: THREE.MeshStandardMaterial; base: THREE.Color }[];
}

const loader = new GLTFLoader();
const glbCache = new Map<string, Promise<THREE.Object3D>>();
const texLoader = new THREE.TextureLoader();

/** Load a GLB and normalize it: feet on y=0, centered, FIG_H tall, facing +z. */
function loadGlb(url: string): Promise<THREE.Object3D> {
  if (!glbCache.has(url)) {
    glbCache.set(
      url,
      loader.loadAsync(url).then((gltf) => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const s = FIG_H / Math.max(1e-6, size.y);
        root.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(root);
        const c = box2.getCenter(new THREE.Vector3());
        root.position.set(-c.x, -box2.min.y, -c.z);
        root.traverse((o: any) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) {
              o.material = o.material.clone();
              if ("roughness" in o.material) o.material.roughness = Math.max(0.6, o.material.roughness ?? 0.8);
            }
          }
        });
        const wrap = new THREE.Group();
        wrap.add(root);
        return wrap;
      }),
    );
  }
  return glbCache.get(url)!.then((o) => o.clone(true));
}

/** A cut-out image standing up as a thin card (used until a mesh exists). */
async function loadCard(url: string): Promise<THREE.Object3D> {
  const tex = await texLoader.loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = tex.image as { width: number; height: number };
  const h = FIG_H;
  const w = (h * img.width) / img.height;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

/** Plain clay figure for members without a persona. */
function defaultFigure(hue: number): THREE.Object3D {
  const g = new THREE.Group();
  const clay = (c: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 6, 16), clay(new THREE.Color().setHSL(hue, 0.35, 0.55)));
  body.position.y = 0.16;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), clay("#e9c7a6"));
  head.position.y = 0.33;
  const eyeMat = clay("#2a2018");
  for (const x of [-0.03, 0.03]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), eyeMat);
    e.position.set(x, 0.345, 0.078);
    g.add(e);
  }
  for (const m of [body, head]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

// ───────────────────────── stage ─────────────────────────

export class Stage {
  root: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private camPos = new THREE.Vector3();
  private camTargetPos = new THREE.Vector3();
  private look = new THREE.Vector3(0, 0.12, -0.22);
  private lookTarget = new THREE.Vector3(0, 0.12, -0.22);
  private figures = new Map<string, Figure>();
  private selfFigure: Figure | null = null;
  private caption: HTMLDivElement;
  private members: StageMember[];
  private viewerId: string | null;
  private quiet: boolean;
  private audioCtx: AudioContext | null = null;
  private current: { cancelled: boolean; skip: boolean; speed: number } | null = null;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private disposed = false;

  constructor(container: HTMLElement, opts: StageOptions) {
    injectCss(container.ownerDocument);
    this.members = opts.members;
    this.viewerId = opts.viewerId ?? null;
    this.quiet = !!opts.quiet;
    const root = document.createElement("div");
    root.className = "s3-root";
    root.innerHTML = `<div class="s3-cap hidden"><div class="who"></div><div class="line"></div><div class="flag"></div></div>${opts.showMark === false ? "" : `<div class="s3-mark">AI-made</div>`}`;
    container.appendChild(root);
    this.root = root;
    this.caption = root.querySelector(".s3-cap") as HTMLDivElement;

    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.outputColorSpace = THREE.SRGBColorSpace;
    root.prepend(r.domElement);
    this.renderer = r;

    this.scene.background = new THREE.Color(ROOM);
    this.scene.fog = new THREE.Fog(ROOM, 3.2, 7.5);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const hemi = new THREE.HemisphereLight("#fff4e6", "#5a4a3a", 0.35);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight("#ffeedd", 2.9);
    key.position.set(-1.2, 2.6, 1.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.5, far: 6 });
    key.shadow.bias = -0.0004;
    key.shadow.radius = 5;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#dfe8ff", 0.5);
    rim.position.set(1.5, 1.2, -2);
    this.scene.add(rim);

    // table
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.5, metalness: 0 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.06, 96), [
      new THREE.MeshStandardMaterial({ color: "#9a6a3e", roughness: 0.55 }),
      wood,
      new THREE.MeshStandardMaterial({ color: "#8a5d35", roughness: 0.6 }),
    ]);
    top.position.y = -0.03;
    top.receiveShadow = true;
    this.scene.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.75, 32), new THREE.MeshStandardMaterial({ color: "#8a5d35", roughness: 0.6 }));
    leg.position.y = -0.43;
    this.scene.add(leg);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: "#d9d0c3", roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.8;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 30);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.resize();
    this.camPos.copy(this.camTargetPos);
    this.layout();
    r.setAnimationLoop(() => this.frame());
  }

  // ───────── layout ─────────

  private homeCamera(): THREE.Vector3 {
    const w = this.root.clientWidth || 360;
    const h = this.root.clientHeight || 640;
    const aspect = w / h;
    // Look down at the table from the viewer's seat; portrait screens sit further back and higher.
    const dist = aspect >= 1 ? 1.7 : 1.7 + (1 - aspect) * 1.7;
    return new THREE.Vector3(0, dist * 0.82, dist * 0.92);
  }

  private resize() {
    const w = this.root.clientWidth || 360;
    const h = this.root.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h >= 1 ? 32 : 40;
    this.camera.updateProjectionMatrix();
    this.camTargetPos.copy(this.homeCamera());
  }

  private arc(): StageMember[] {
    return this.members.filter((m) => m.id !== this.viewerId);
  }

  setMembers(members: StageMember[]) {
    const prev = new Map(this.members.map((m) => [m.id, m]));
    this.members = members;
    const same =
      members.length === prev.size &&
      members.every((m) => prev.has(m.id) && JSON.stringify(prev.get(m.id)!.figure ?? null) === JSON.stringify(m.figure ?? null) && prev.get(m.id)!.personaUrl === m.personaUrl && prev.get(m.id)!.name === m.name);
    if (!same) this.layout();
    for (const m of members) this.setPresence(m.id, m.present);
  }

  private clearFigures() {
    for (const f of [...this.figures.values(), ...(this.selfFigure ? [this.selfFigure] : [])]) {
      this.scene.remove(f.group);
      f.label.remove();
    }
    this.figures.clear();
    this.selfFigure = null;
  }

  private layout() {
    this.clearFigures();
    const arc = this.arc();
    const n = arc.length;
    const portrait = (this.root.clientWidth || 360) < (this.root.clientHeight || 640);
    const spread = n <= 1 ? 0 : Math.min(portrait ? 110 : 150, (portrait ? 38 : 46) * (n - 1)) * (Math.PI / 180);
    arc.forEach((m, i) => {
      const phi = n <= 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      const seat = new THREE.Vector3(Math.sin(phi) * SEAT_R, 0, -Math.cos(phi) * SEAT_R);
      this.figures.set(m.id, this.makeFigure(m, seat, i));
    });
    const me = this.members.find((m) => m.id === this.viewerId);
    if (me) {
      const f = this.makeFigure(me, new THREE.Vector3(0, 0, 0.78), 9);
      f.self = true;
      f.group.visible = false;
      this.selfFigure = f;
    }
  }

  private makeFigure(member: StageMember, seat: THREE.Vector3, i: number): Figure {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);
    group.position.copy(seat);
    this.scene.add(group);
    const label = document.createElement("div");
    label.className = "s3-name";
    label.textContent = member.name;
    this.root.appendChild(label);
    const f: Figure = {
      member,
      group,
      body,
      poses: new Map(),
      current: member.present ? "neutral" : "away",
      seat: seat.clone(),
      pos: seat.clone(),
      target: seat.clone(),
      yaw: 0,
      targetYaw: 0,
      hopT: -1,
      squash: 0,
      breathe: false,
      gesture: "none",
      gestureT: 0,
      dim: member.present ? 0 : 1,
      targetDim: member.present ? 0 : 1,
      label,
      materials: [],
    };
    f.yaw = f.targetYaw = this.yawTo(seat, this.camPos.lengthSq() ? this.camPos : this.homeCamera());
    group.rotation.y = f.yaw;
    void this.loadPoses(f, i);
    return f;
  }

  private async loadPoses(f: Figure, i: number) {
    const fig = f.member.figure ?? {};
    const poses: Pose[] = ["neutral", "happy", "laughing", "surprised", "angry", "sad", "away"];
    const load = async (pose: Pose): Promise<THREE.Object3D | null> => {
      const a = fig[pose];
      try {
        if (a?.glb) return await loadGlb(a.glb);
        if (a?.img) return await loadCard(a.img);
      } catch {
        /* fall through */
      }
      if (pose === "neutral" && f.member.personaUrl) return loadCard(f.member.personaUrl).catch(() => null);
      if (pose === "away" && f.member.awayUrl) return loadCard(f.member.awayUrl).catch(() => null);
      return null;
    };
    // neutral and away first (visible immediately), the rest after
    for (const batch of [["neutral", "away"], poses.filter((p) => p !== "neutral" && p !== "away")] as Pose[][]) {
      const objs = await Promise.all(batch.map(load));
      if (this.disposed) return;
      batch.forEach((p, k) => {
        const o = objs[k];
        if (!o) return;
        o.visible = false;
        f.body.add(o);
        f.poses.set(p, o);
        o.traverse((x: any) => {
          if (x.isMesh && x.material && "color" in x.material) f.materials.push({ m: x.material, base: x.material.color.clone() });
        });
      });
      if (!f.poses.has("neutral")) {
        const d = defaultFigure((i * 0.17) % 1);
        d.visible = false;
        f.body.add(d);
        f.poses.set("neutral", d);
        d.traverse((x: any) => x.isMesh && f.materials.push({ m: x.material, base: x.material.color.clone() }));
      }
      this.showPose(f, f.current);
    }
  }

  private resolvePose(f: Figure, pose: Pose): Pose {
    if (f.poses.has(pose)) return pose;
    for (const p of POSE_FALLBACK[pose]) if (f.poses.has(p)) return p;
    return "neutral";
  }

  private showPose(f: Figure, pose: Pose) {
    f.current = pose;
    const shown = this.resolvePose(f, pose);
    for (const [p, o] of f.poses) o.visible = p === shown;
  }

  private yawTo(from: THREE.Vector3, to: THREE.Vector3): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  setPresence(memberId: string, present: boolean) {
    const f = this.figures.get(memberId);
    if (!f) return;
    f.member.present = present;
    if (f.hopT >= 0 || f.target.distanceTo(f.seat) > 0.01) return; // performing: restored after
    f.targetDim = present ? 0 : 1;
    this.showPose(f, present ? "neutral" : "away");
  }

  setWaiting(memberId: string, on: boolean) {
    const f = this.figures.get(memberId);
    if (f) f.breathe = on;
  }

  // ───────── frame ─────────

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(this.camTargetPos, 1 - Math.exp(-dt * 3));
    this.look.lerp(this.lookTarget, 1 - Math.exp(-dt * 3));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.look);
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const v = new THREE.Vector3();
    for (const f of [...this.figures.values(), ...(this.selfFigure ? [this.selfFigure] : [])]) {
      f.pos.lerp(f.target, k);
      let dy = f.yaw - f.targetYaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      f.yaw -= dy * k;
      f.group.position.copy(f.pos);
      f.group.rotation.y = f.yaw;
      // hop
      let hop = 0;
      if (f.hopT >= 0) {
        f.hopT += dt;
        hop = f.hopT < 0.42 ? Math.sin((f.hopT / 0.42) * Math.PI) * 0.06 : 0;
      }
      // idle sway, breathing, talking squash
      const idle = f.dim > 0.5 ? 0 : Math.sin(t * 1.7 + f.seat.x * 9) * 0.004;
      const breathe = f.breathe ? Math.sin(t * 4) * 0.02 : 0;
      const sq = f.squash + breathe;
      f.body.position.y = hop + idle;
      f.body.scale.set(1 - sq * 0.35, 1 + sq, 1 - sq * 0.35);
      // gestures
      f.gestureT += dt;
      let tiltX = 0, wig = 0;
      if (f.gesture === "nod") tiltX = Math.sin(f.gestureT * 9) * 0.12 * Math.max(0, 1 - f.gestureT / 1.2);
      if (f.gesture === "shake") wig = Math.sin(f.gestureT * 14) * 0.18 * Math.max(0, 1 - f.gestureT / 1.0);
      if (f.gesture === "lean_in") tiltX = 0.12;
      if (f.gesture === "step_back") tiltX = -0.06;
      f.body.rotation.set(tiltX, wig, 0);
      // presence dim
      f.dim += (f.targetDim - f.dim) * k;
      for (const { m, base } of f.materials) m.color.copy(base).multiplyScalar(1 - 0.38 * f.dim);
      // name label under the figure
      if (!f.self && f.group.visible) {
        v.set(f.pos.x, -0.02, f.pos.z).project(this.camera);
        f.label.style.left = `${((v.x + 1) / 2) * w}px`;
        f.label.style.top = `${((1 - v.y) / 2) * h + 2}px`;
        f.label.classList.toggle("away", f.dim > 0.5);
        f.label.style.opacity = f.target.distanceTo(f.seat) > 0.05 ? "0" : "1";
      } else f.label.style.opacity = "0";
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ───────── audio ─────────

  private ctx(): AudioContext | null {
    try {
      this.audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
      if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
      return this.audioCtx;
    } catch {
      return null;
    }
  }
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
      o.frequency.setValueAtTime(1320, now);
      o.frequency.exponentialRampToValueAtTime(880, now + 0.25);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(now);
      o.stop(now + 0.65);
      return;
    }
    for (let i = 0; i < Math.floor(durationMs / 95); i++) {
      const tt = now + i * 0.095 + Math.random() * 0.03;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(1700 + Math.random() * 500, tt);
      g.gain.setValueAtTime(0.025, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.03);
      o.connect(g).connect(ctx.destination);
      o.start(tt);
      o.stop(tt + 0.035);
    }
  }

  // ───────── caption & camera ─────────

  private showCaption(item: PerformItem) {
    const who = item.memberId === this.viewerId ? "You" : this.members.find((m) => m.id === item.memberId)?.name ?? "";
    (this.caption.querySelector(".who") as HTMLElement).textContent = who;
    (this.caption.querySelector(".line") as HTMLElement).textContent = item.text;
    (this.caption.querySelector(".flag") as HTMLElement).textContent =
      this.quiet || item.status !== "captions_only" ? "" : item.flags?.includes("voice_disabled") ? "Captions only" : "Voice did not pass the read-back check. Captions only.";
    this.caption.classList.remove("hidden");
  }
  hideCaption() {
    this.caption.classList.add("hidden");
  }

  private shot(f: Figure | null, camera: Camera) {
    const home = this.homeCamera();
    if (!f || camera !== "close") {
      this.camTargetPos.copy(home);
      this.lookTarget.set(0, 0.12, -0.22);
      return;
    }
    const at = f.target.clone();
    this.lookTarget.set(at.x * 0.8, FIG_H * 0.55, at.z);
    this.camTargetPos.set(at.x * 0.5, 0.42, at.z + 1.05);
  }

  // ───────── perform ─────────

  async perform(item: PerformItem, opts: { speed?: number; signal?: { cancelled: boolean; skip: boolean } } = {}): Promise<void> {
    const speed = opts.speed ?? 1;
    const signal = opts.signal ?? { cancelled: false, skip: false };
    (window as any).__sceneLog ??= [];
    (window as any).__sceneLog.push({ t: Date.now(), id: item.messageId, member: item.memberId, status: item.status });
    const self = item.memberId === this.viewerId && this.selfFigure ? this.selfFigure : null;
    const f = self ?? this.figures.get(item.memberId) ?? null;
    const wasAway = f && !f.self ? !f.member.present : false;
    const others = [...this.figures.values()].filter((x) => x !== f);
    if (f) {
      if (f.self) f.group.visible = true;
      f.breathe = false;
      f.targetDim = 0;
      f.target.copy(f.self ? new THREE.Vector3(0, 0, 0.62) : FRONT.clone().add(new THREE.Vector3(f.seat.x * 0.25, 0, 0)));
      f.targetYaw = this.yawTo(f.target, this.homeCamera());
      this.showPose(f, item.emotion);
      f.hopT = 0;
      f.gesture = item.gesture;
      f.gestureT = 0;
    }
    // listeners: turn to the speaker, react as directed
    const reactions = new Map((item.reactions ?? []).map((r) => [r.memberId, r]));
    for (const o of others) {
      const r = reactions.get(o.member.id);
      const awake = o.member.present || !!r;
      if (r) {
        o.targetDim = 0;
        this.showPose(o, r.pose);
      } else this.showPose(o, o.member.present ? "neutral" : "away");
      const look = r?.look ?? (awake ? "speaker" : "down");
      o.targetYaw = look === "speaker" && f ? this.yawTo(o.seat, f.target) : this.yawTo(o.seat, this.homeCamera());
      o.gesture = look === "down" ? "none" : o.gesture;
    }
    this.shot(f, item.camera);
    this.showCaption(item);

    const dur = itemDuration(item) / speed;
    await new Promise((r) => setTimeout(r, 380 / speed)); // walk to the front
    let audio: HTMLAudioElement | null = null;
    if (item.status === "verified" && item.audioUrl) {
      audio = new Audio(item.audioUrl);
      audio.playbackRate = speed;
      try {
        await audio.play();
      } catch {
        audio = null;
      }
    } else if (item.status === "silent") this.blip("ding", dur);
    else this.blip("type", Math.min(dur, 2400));

    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (signal.cancelled || signal.skip) return resolve();
        const elapsed = audio ? audio.currentTime * 1000 : (performance.now() - t0) * speed;
        if (f) {
          const env = item.envelope ?? [];
          const v = env.length ? env[Math.min(env.length - 1, Math.floor((elapsed / 1000) * ENV_FPS))] ?? 0 : audio ? 0 : 0.35 + 0.35 * Math.sin(elapsed / 90);
          f.squash = 0.05 * v;
        }
        const ended = audio ? audio.ended || (audio.paused && audio.currentTime > 0) : performance.now() - t0 >= dur;
        if (ended) return resolve();
        setTimeout(tick, 33);
      };
      setTimeout(tick, 0);
    });
    if (audio && !audio.ended) audio.pause();
    if (f) {
      f.squash = 0;
      f.hopT = -1;
      f.gesture = "none";
      if (f.self) {
        f.group.visible = false;
      } else {
        f.target.copy(f.seat);
        f.targetYaw = this.yawTo(f.seat, this.homeCamera());
        if (wasAway && !f.member.present) {
          f.targetDim = 1;
          this.showPose(f, "away");
        } else this.showPose(f, "neutral");
      }
    }
    await new Promise((r) => setTimeout(r, 220 / speed));
  }

  play(items: PerformItem[], opts: { speed?: number; startIndex?: number; onItem?: (i: number, item: PerformItem) => void; onEnd?: () => void } = {}): PlayController {
    this.current && (this.current.cancelled = true);
    const state = { cancelled: false, skip: false, speed: opts.speed ?? 1, index: opts.startIndex ?? 0 };
    this.current = state;
    const wait = (ms: number) =>
      new Promise<void>((res) => {
        const t0 = performance.now();
        const tick = () => (state.cancelled || state.skip || performance.now() - t0 >= ms ? res() : setTimeout(tick, 30));
        tick();
      });
    const done = (async () => {
      for (let i = state.index; i < items.length; i++) {
        if (state.cancelled) break;
        state.index = i;
        await wait(items[i].pauseMs / state.speed);
        if (state.cancelled) break;
        state.skip = false;
        opts.onItem?.(i, items[i]);
        await this.perform(items[i], { speed: state.speed, signal: state });
        state.skip = false;
      }
      this.shot(null, "room");
      for (const o of this.figures.values()) {
        this.showPose(o, o.member.present ? "neutral" : "away");
        o.targetYaw = this.yawTo(o.seat, this.homeCamera());
        o.targetDim = o.member.present ? 0 : 1;
      }
      if (!state.cancelled) {
        this.hideCaption();
        opts.onEnd?.();
      }
    })();
    return {
      done,
      skip: () => (state.skip = true),
      stop: () => (state.cancelled = true),
      setSpeed: (s: number) => (state.speed = s),
      get index() {
        return state.index;
      },
    };
  }

  destroy() {
    this.disposed = true;
    this.current && (this.current.cancelled = true);
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.clearFigures();
    this.renderer.dispose();
    this.root.remove();
  }
}

export function createStage(container: HTMLElement, opts: StageOptions): Stage {
  return new Stage(container, opts);
}
