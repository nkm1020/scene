// Scene stage in 3D, first person: you sit at a round wooden table with your friends as seated clay figurines
// (SAM 3D meshes). You turn to whoever is talking; listeners turn and react as the director says;
// friends who are not connected sleep slumped over on their stools.

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
    t += itemDuration(item) / speed + 600 / speed; // turn and settle
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
const FIG_H = 0.8; // a seated figure on its stool, floor to the top of the head
const PIVOT_Y = 0.2; // the stool top: figures lean and nod around it
const TABLE_Y = 0.34; // table top
const EYE_Y = 0.7; // the viewer's eyes, a little above everyone else's so the table reads
const CENTER = new THREE.Vector3(0, TABLE_Y, 0);
const ENV_FPS = 30;

/**
 * Seats around a round table for the viewer plus `others` people. The viewer keeps a little elbow room
 * (the neighbours sit at least 115° away) so the people beside you stay in view; the rest are spaced evenly.
 * Angles are measured from the viewer's seat, going from the viewer's left around to the right.
 */
function seatRing(others: number) {
  const n = others + 1;
  const gap = others <= 1 ? Math.PI : Math.max((2 * Math.PI) / n, (115 * Math.PI) / 180);
  const step = others <= 1 ? 0 : (2 * Math.PI - 2 * gap) / (others - 1);
  const angles = Array.from({ length: Math.max(0, others) }, (_, i) => gap + i * step);
  const rSeat = Math.max(0.52, others <= 1 ? 0 : 0.26 / Math.sin(step / 2));
  return { rSeat, rTable: rSeat - 0.17, angles };
}

const CSS = `
.s3-root{position:relative;width:100%;height:100%;min-height:360px;overflow:hidden;background:${ROOM};font-family:"Hanken Grotesk",ui-sans-serif,system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;color:${INK};user-select:none;-webkit-user-select:none}
.s3-root canvas{display:block;width:100%!important;height:100%!important}
.s3-cap{position:absolute;left:14px;right:14px;bottom:14px;background:#fff;padding:12px 14px 13px;transition:opacity .25s ease,transform .25s ease}
.s3-cap.hidden{opacity:0;transform:translateY(8px)}
.s3-cap .who{font-size:13px;font-weight:600;color:#6b6259}
.s3-cap .line{font-size:clamp(19px,4.4vw,26px);line-height:1.22;font-weight:700;letter-spacing:-.01em;margin-top:2px}
.s3-cap .flag{font-size:12px;color:#8a5a00;margin-top:4px}
.s3-mark{position:absolute;top:10px;right:12px;font-size:11px;color:#6b6259}
.s3-name{position:absolute;transform:translate(-50%,-50%);font-size:12px;font-weight:600;color:${INK};background:#fff;padding:2px 7px 3px;white-space:nowrap;pointer-events:none;transition:opacity .3s}
.s3-name.away{color:#8a8077}
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
  for (let p = 0; p < 6; p++) {
    const x0 = (p * 1024) / 6;
    g.fillStyle = `rgba(${90 + p * 7},${55 + p * 4},${28},${0.08 + (p % 2) * 0.05})`;
    g.fillRect(x0, 0, 1024 / 6, 1024);
    g.fillStyle = "rgba(60,35,18,.35)";
    g.fillRect(x0, 0, 2, 1024);
  }
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * 1024;
    g.strokeStyle = `rgba(70,40,18,${0.04 + Math.random() * 0.08})`;
    g.lineWidth = 0.6 + Math.random() * 1.6;
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
  group: THREE.Group; // on the floor at the seat, turns (yaw)
  body: THREE.Group; // squash and bounce, pivot at the floor
  tilt: THREE.Group; // lean and nod, pivot at the stool top
  poses: Map<Pose, THREE.Object3D>;
  cards: Set<THREE.Object3D>; // flat cut-outs: always turned to the viewer
  current: Pose;
  seat: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  speaking: boolean;
  hopT: number; // seconds since the line started (−1 = none)
  squash: number;
  breathe: boolean;
  gesture: Gesture;
  gestureT: number;
  dim: number;
  targetDim: number;
  label: HTMLDivElement;
  materials: { m: THREE.MeshStandardMaterial; base: THREE.Color }[];
}

const loader = new GLTFLoader();
const glbCache = new Map<string, Promise<THREE.Object3D>>();
const texLoader = new THREE.TextureLoader();

/** Load a GLB and normalize it: on the floor, centered, `height` tall, facing +z. */
function loadGlb(url: string, height = FIG_H): Promise<THREE.Object3D> {
  const key = `${url}|${height.toFixed(4)}`;
  if (!glbCache.has(key)) {
    glbCache.set(
      key,
      loader.loadAsync(url).then((gltf) => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        root.scale.setScalar(height / Math.max(1e-6, size.y));
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
  return glbCache.get(key)!.then((o) => o.clone(true));
}

/** A cut-out image and the rows its subject spans (all poses of a figure are cut at one scale). */
interface Cut {
  tex: THREE.Texture;
  w: number;
  h: number;
  top: number;
  bottom: number;
}
const cutCache = new Map<string, Promise<Cut>>();

function loadCut(url: string): Promise<Cut> {
  if (!cutCache.has(url)) {
    cutCache.set(
      url,
      texLoader.loadAsync(url).then((tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const img = tex.image as HTMLImageElement;
        const w = img.width, h = img.height;
        let top = 0, bottom = h - 1;
        try {
          // find the subject's first and last rows on a quarter-size copy
          const cw = Math.max(1, Math.round(w / 4)), ch = Math.max(1, Math.round(h / 4));
          const c = document.createElement("canvas");
          c.width = cw;
          c.height = ch;
          const g = c.getContext("2d", { willReadFrequently: true })!;
          g.drawImage(img, 0, 0, cw, ch);
          const d = g.getImageData(0, 0, cw, ch).data;
          const rowOn = (y: number) => {
            for (let x = 0; x < cw; x++) if (d[(y * cw + x) * 4 + 3] > 127) return true;
            return false;
          };
          let t = 0;
          while (t < ch && !rowOn(t)) t++;
          let b = ch - 1;
          while (b > t && !rowOn(b)) b--;
          if (t < b) {
            top = (t / ch) * h;
            bottom = ((b + 1) / ch) * h;
          }
        } catch {
          /* tainted or no canvas: use the whole image */
        }
        return { tex, w, h, top, bottom };
      }),
    );
  }
  return cutCache.get(url)!;
}

/** Stand a cut-out up as a card, `k` world units per image pixel, the subject's feet on y=0. */
function makeCard(cut: Cut, k: number): THREE.Object3D {
  const w = cut.w * k, h = cut.h * k;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, cut.bottom * k - h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ map: cut.tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: cut.tex, alphaTest: 0.5 });
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.card = true;
  return g;
}

/** Plain clay figure on a stool, for members without a figurine. */
function defaultFigure(hue: number): THREE.Object3D {
  const g = new THREE.Group();
  const clay = (c: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  const woodM = clay("#8a5d35");
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 24), woodM);
  seat.position.y = PIVOT_Y - 0.015;
  g.add(seat);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, PIVOT_Y - 0.03, 8), woodM);
    leg.position.set(Math.sin(a) * 0.07, (PIVOT_Y - 0.03) / 2, Math.cos(a) * 0.07);
    g.add(leg);
  }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.14, 6, 16), clay(new THREE.Color().setHSL(hue, 0.35, 0.55)));
  body.position.y = PIVOT_Y + 0.17;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), clay("#e9c7a6"));
  head.position.y = PIVOT_Y + 0.44;
  const eyeMat = clay("#2a2018");
  for (const x of [-0.04, 0.04]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), eyeMat);
    e.position.set(x, PIVOT_Y + 0.46, 0.1);
    g.add(e);
  }
  for (const m of [body, head, seat]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

// ───────────────────────── stage ─────────────────────────

/**
 * First person at a round table: the viewer sits in one seat (the camera), everyone else sits around the table.
 * The viewer turns to whoever is talking; the speaker talks to the viewer; listeners turn to the speaker.
 * Members who are not connected sleep slumped over their knees.
 */
export class Stage {
  root: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private camPos = new THREE.Vector3(0, EYE_Y, 0.7);
  private look = new THREE.Vector3(0, TABLE_Y + 0.1, -0.3);
  private lookTarget = new THREE.Vector3(0, TABLE_Y + 0.1, -0.3);
  private baseFov = 56;
  private fov = 56;
  private fovTarget = 56;
  private ring = seatRing(3);
  private table = new THREE.Group();
  private figures = new Map<string, Figure>();
  private caption: HTMLDivElement;
  private members: StageMember[];
  private viewerId: string | null;
  private quiet: boolean;
  private audioCtx: AudioContext | null = null;
  private current: { cancelled: boolean; skip: boolean; speed: number } | null = null;
  private focus: Figure | null = null;
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
    this.scene.fog = new THREE.Fog(ROOM, 1.6, 4.5);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.scene.add(new THREE.HemisphereLight("#fff4e6", "#5a4a3a", 0.4));
    // one warm light over the table, like a pendant lamp
    const key = new THREE.DirectionalLight("#ffeedd", 2.6);
    key.position.set(-0.5, 2.4, 0.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.5, far: 5 });
    key.shadow.bias = -0.0004;
    key.shadow.radius = 5;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#dfe8ff", 0.45);
    fill.position.set(1.2, 1.0, 1.8);
    this.scene.add(fill);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.MeshStandardMaterial({ color: ROOM, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.scene.add(this.table);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.03, 30);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.layout();
    this.resize();
    this.look.copy(this.lookTarget);
    r.setAnimationLoop(() => this.frame());
  }

  // ───────── layout ─────────

  private buildTable() {
    this.table.clear();
    const { rTable } = this.ring;
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.5, metalness: 0 });
    const edge = new THREE.MeshStandardMaterial({ color: "#8a5d35", roughness: 0.6 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(rTable, rTable, 0.035, 96), [edge, wood, edge]);
    top.position.y = TABLE_Y - 0.0175;
    top.receiveShadow = true;
    top.castShadow = true;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, TABLE_Y - 0.035, 24), edge);
    leg.position.y = (TABLE_Y - 0.035) / 2;
    leg.castShadow = true;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 48), edge);
    foot.position.y = 0.01;
    foot.receiveShadow = true;
    this.table.add(top, leg, foot);
  }

  private resize() {
    const w = this.root.clientWidth || 360;
    const h = this.root.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // portrait phones get a taller view so the speaker fits; landscape sees most of the table at once
    this.baseFov = w / h >= 1 ? 56 : 58;
    this.fovTarget = this.baseFov * (this.fovTarget / Math.max(1, this.fov) < 0.9 ? 0.7 : 1);
    this.fov = this.fovTarget;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.shot(this.focus, "room");
  }

  private portrait() {
    return (this.root.clientWidth || 360) < (this.root.clientHeight || 640);
  }

  /** Everyone at the table except the viewer, in seat order from the viewer's left to right. */
  private others(): StageMember[] {
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
    for (const f of this.figures.values()) {
      this.scene.remove(f.group);
      f.label.remove();
    }
    this.figures.clear();
    this.focus = null;
  }

  private layout() {
    this.clearFigures();
    const others = this.others();
    this.ring = seatRing(others.length);
    this.buildTable();
    const { rSeat, angles } = this.ring;
    // the viewer sits at +z looking toward −z; the others go from the viewer's left around to the right
    this.camPos.set(0, EYE_Y, rSeat + 0.14); // sitting back in the chair
    others.forEach((m, i) => {
      const a = -angles[i];
      const seat = new THREE.Vector3(Math.sin(a) * rSeat, 0, Math.cos(a) * rSeat);
      this.figures.set(m.id, this.makeFigure(m, seat, i));
    });
    this.shot(null, "room");
  }

  private makeFigure(member: StageMember, seat: THREE.Vector3, i: number): Figure {
    const group = new THREE.Group();
    const body = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.position.y = PIVOT_Y;
    body.add(tilt);
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
      tilt,
      poses: new Map(),
      cards: new Set(),
      current: member.present ? "neutral" : "away",
      seat: seat.clone(),
      yaw: 0,
      targetYaw: 0,
      speaking: false,
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
    f.yaw = f.targetYaw = this.yawTo(seat, CENTER);
    group.rotation.y = f.yaw;
    void this.loadPoses(f, i);
    return f;
  }

  private async loadPoses(f: Figure, i: number) {
    const fig = f.member.figure ?? {};
    const poses: Pose[] = ["neutral", "happy", "laughing", "surprised", "angry", "sad", "away"];
    const imgUrl = (p: Pose) => fig[p]?.img ?? (p === "neutral" ? f.member.personaUrl : p === "away" ? f.member.awayUrl : null) ?? null;
    // one scale per figure, from the neutral pose: a slumped or leaning pose keeps its true size
    let k: number | null = null;
    const nUrl = imgUrl("neutral");
    if (nUrl) {
      try {
        const n = await loadCut(nUrl);
        k = FIG_H / Math.max(1, n.bottom - n.top);
      } catch {
        /* no neutral image */
      }
    }
    const load = async (pose: Pose): Promise<THREE.Object3D | null> => {
      const url = imgUrl(pose);
      const cut = url ? await loadCut(url).catch(() => null) : null;
      const kk = k ?? (cut ? FIG_H / Math.max(1, cut.bottom - cut.top) : null);
      const glb = fig[pose]?.glb;
      if (glb) {
        try {
          return await loadGlb(glb, cut && kk ? (cut.bottom - cut.top) * kk : FIG_H);
        } catch {
          /* fall back to the card */
        }
      }
      return cut && kk ? makeCard(cut, kk) : null;
    };
    // neutral and away first (visible immediately), the rest after
    for (const batch of [["neutral", "away"], poses.filter((p) => p !== "neutral" && p !== "away")] as Pose[][]) {
      const objs = await Promise.all(batch.map(load));
      if (this.disposed) return;
      const add = (p: Pose, o: THREE.Object3D) => {
        o.visible = false;
        o.position.y = -PIVOT_Y;
        f.tilt.add(o);
        f.poses.set(p, o);
        if (o.userData.card) f.cards.add(o);
        o.traverse((x: any) => {
          if (x.isMesh && x.material && "color" in x.material) f.materials.push({ m: x.material, base: x.material.color.clone() });
        });
      };
      batch.forEach((p, j) => objs[j] && add(p, objs[j]!));
      if (!f.poses.has("neutral")) add("neutral", defaultFigure((i * 0.17) % 1));
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

  /** Back to the table at rest: present members face the table, absent ones sleep. */
  private rest(o: Figure) {
    this.showPose(o, o.member.present ? "neutral" : "away");
    o.targetDim = o.member.present ? 0 : 1;
    o.targetYaw = this.yawTo(o.seat, CENTER);
    o.gesture = "none";
  }

  setPresence(memberId: string, present: boolean) {
    const f = this.figures.get(memberId);
    if (!f) return;
    f.member.present = present;
    if (f.speaking || this.current) return; // restored after the line
    this.rest(f);
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
    const kc = 1 - Math.exp(-dt * 3.6);
    this.look.lerp(this.lookTarget, kc);
    this.fov += (this.fovTarget - this.fov) * kc;
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.camPos);
    this.camera.position.y += Math.sin(t * 0.7) * 0.002; // breathing
    this.camera.lookAt(this.look);
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const v = new THREE.Vector3();
    const { rSeat, rTable } = this.ring;
    for (const f of this.figures.values()) {
      let dy = f.yaw - f.targetYaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      f.yaw -= dy * k;
      f.group.rotation.y = f.yaw;
      // a small bounce when a line starts
      let hop = 0;
      if (f.hopT >= 0) {
        f.hopT += dt;
        hop = f.hopT < 0.36 ? Math.sin((f.hopT / 0.36) * Math.PI) * 0.025 : 0;
      }
      const asleep = f.dim > 0.5;
      const idle = asleep ? Math.sin(t * 0.9 + f.seat.x * 5) * 0.004 : Math.sin(t * 1.7 + f.seat.x * 9) * 0.003;
      const breathe = f.breathe ? Math.sin(t * 4) * 0.02 : 0;
      const sq = f.squash + breathe;
      f.body.position.y = hop;
      f.body.scale.set(1 - sq * 0.35, 1 + sq + (asleep ? idle : 0), 1 - sq * 0.35);
      // lean and nod around the stool top
      f.gestureT += dt;
      let tiltX = asleep ? 0 : idle, wig = 0;
      if (f.gesture === "nod") tiltX += Math.sin(f.gestureT * 9) * 0.1 * Math.max(0, 1 - f.gestureT / 1.2);
      if (f.gesture === "shake") wig = Math.sin(f.gestureT * 14) * 0.16 * Math.max(0, 1 - f.gestureT / 1.0);
      if (f.gesture === "lean_in") tiltX += 0.12;
      if (f.gesture === "step_back") tiltX -= 0.07;
      f.tilt.rotation.set(tiltX, wig, 0);
      // flat cut-outs always face the viewer (a mesh turns for real)
      if (f.cards.size) {
        const toCam = this.yawTo(f.seat, this.camPos) - f.yaw;
        for (const o of f.cards) o.rotation.y = toCam;
      }
      f.dim += (f.targetDim - f.dim) * k;
      // asleep: pulled in to the table, slumped over its edge
      f.group.position.copy(f.seat).multiplyScalar(1 - (0.08 * f.dim * this.ring.rTable) / this.ring.rSeat);
      for (const { m, base } of f.materials) m.color.copy(base).multiplyScalar(1 - 0.3 * f.dim);
      // name card on the table edge in front of the seat
      v.copy(f.seat).multiplyScalar((rTable - 0.05) / rSeat).setY(TABLE_Y + 0.01).project(this.camera);
      const onScreen = v.z < 1 && v.x > -1.1 && v.x < 1.1;
      f.label.style.left = `${((v.x + 1) / 2) * w}px`;
      f.label.style.top = `${((1 - v.y) / 2) * h}px`;
      f.label.classList.toggle("away", asleep);
      f.label.style.opacity = onScreen ? "1" : "0";
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

  /** Where the viewer looks: across the table at rest, or turned toward the speaker. */
  private shot(f: Figure | null, camera: Camera) {
    this.focus = f;
    const portrait = this.portrait();
    const rest = new THREE.Vector3(0, portrait ? 0.5 : 0.44, -this.ring.rSeat * 0.6);
    if (!f && this.figures.size === 1) {
      // one person across the table (the figure preview): look at them, closer
      const only = [...this.figures.values()][0];
      this.lookTarget.set(only.seat.x, 0.48, only.seat.z);
      this.fovTarget = this.baseFov * 0.62;
      return;
    }
    if (!f) {
      this.lookTarget.copy(rest);
      this.fovTarget = this.baseFov;
      return;
    }
    const face = new THREE.Vector3(f.seat.x, portrait ? 0.54 : 0.5, f.seat.z);
    this.lookTarget.copy(rest).lerp(face, portrait ? 1 : 0.75);
    this.fovTarget = this.baseFov * (camera === "close" ? 0.7 : 1);
  }

  // ───────── perform ─────────

  async perform(item: PerformItem, opts: { speed?: number; signal?: { cancelled: boolean; skip: boolean } } = {}): Promise<void> {
    const speed = opts.speed ?? 1;
    const signal = opts.signal ?? { cancelled: false, skip: false };
    (window as any).__sceneLog ??= [];
    (window as any).__sceneLog.push({ t: Date.now(), id: item.messageId, member: item.memberId, status: item.status });
    // null when the viewer is the one talking: there is no figure, everyone looks at the camera
    const f = item.memberId === this.viewerId ? null : this.figures.get(item.memberId) ?? null;
    const others = [...this.figures.values()].filter((x) => x !== f);
    if (f) {
      f.speaking = true;
      f.breathe = false;
      f.targetDim = 0;
      f.targetYaw = this.yawTo(f.seat, this.camPos); // talks to you
      this.showPose(f, item.emotion);
      f.hopT = 0;
      f.gesture = item.gesture;
      f.gestureT = 0;
    }
    // listeners: turn to the speaker (or to you), react as the director says
    const reactions = new Map((item.reactions ?? []).map((r) => [r.memberId, r]));
    for (const o of others) {
      const r = reactions.get(o.member.id);
      const awake = o.member.present || !!r;
      if (r) {
        o.targetDim = 0;
        this.showPose(o, r.pose);
      } else this.showPose(o, o.member.present ? "neutral" : "away");
      if (!r && !o.member.present) o.targetDim = 1;
      const look = r?.look ?? (awake ? "speaker" : "down");
      o.targetYaw =
        look === "camera" || (look === "speaker" && !f) ? this.yawTo(o.seat, this.camPos) : look === "speaker" && f ? this.yawTo(o.seat, f.seat) : this.yawTo(o.seat, CENTER);
      o.gesture = "none";
    }
    this.shot(f, item.camera);
    this.showCaption(item);

    const dur = itemDuration(item) / speed;
    await new Promise((r) => setTimeout(r, 380 / speed)); // turn to the speaker
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
          f.squash = 0.04 * v;
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
      f.speaking = false;
      f.gesture = "none";
      if (!f.member.present) this.rest(f);
      else this.showPose(f, "neutral");
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
      if (this.current === state) this.current = null;
      this.shot(null, "room");
      for (const o of this.figures.values()) this.rest(o);
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
