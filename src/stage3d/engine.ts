// Scene stage in 3D, first person, shot like a stop-motion film: you sit at a round table in a miniature dining room
// with your friends as seated clay figurines (SAM 3D meshes). Everything moves twelve pictures a second; mouths,
// blinks and laughs are replacement frames (Muse Image edits) swapped in like stop-motion faces; the clay boils.
// People turn on their stools the way they do at a table: the speaker turns to whoever the line is for, everyone else
// turns to the speaker. Absent friends sleep slumped over.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import * as miniSet from "./set";

export type Emotion = "neutral" | "happy" | "surprised" | "angry" | "sad" | "laughing";
export type Gesture = "none" | "lean_in" | "step_back" | "shake" | "nod";
export type Camera = "room" | "close";
export type Pose = Emotion | "away";
export type Look = "speaker" | "camera" | "down";

const wrapPi = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

/** What a listener's reaction looks like above their head (neutral and asleep show nothing). */
const REACTION_EMOJI: Partial<Record<Pose, string>> = { laughing: "😂", surprised: "😮", angry: "💢", sad: "😢", happy: "😊" };

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
  /** who the line is said to: a member id (the viewer included) or "all"; absent means the viewer */
  to?: string | null;
  pauseMs: number;
  reactions?: Reaction[];
  audioUrl?: string | null;
  envelope?: number[];
  durationMs?: number;
  status?: "verified" | "captions_only" | "silent" | "pending";
  flags?: string[];
  readback?: { score: number; heard: string }[];
  /** the line's frame number on the chat strip, printed with it on stage */
  frame?: string;
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
    t += itemDuration(item) / speed + 820 / speed; // turn and settle
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

const ROOM = "#0e0d0c"; // the UI's warm near-black, behind the set while it loads
const INK = "#111111";
const LAMP = "#f2b33d"; // the one data hue: who is speaking
const FIG_H = 0.8; // a seated figure on its stool, floor to the top of the head
const PIVOT_Y = 0.2; // the stool top: figures lean and nod around it
const TABLE_Y = 0.34; // table top
const EYE_Y = 0.7; // the viewer's eyes, a little above everyone else's so the table reads
const CENTER = new THREE.Vector3(0, TABLE_Y, 0);
const ENV_FPS = 30;
const FPS = 12; // stop motion: the puppets get a new picture twelve times a second (animated "on twos")
const RENDER_FPS = 24; // the camera moves on ones, as a motion-control rig would shoot it
const FRAMES = ["talk_a", "talk_b", "blink", "wake", "happy_b", "laughing_b", "surprised_b", "angry_b", "sad_b", "q3", "side", "q3_talk", "side_talk"];
/** Which turnaround picture shows a figure at this angle away from the lens. */
const viewOf = (rel: number) => (Math.abs(rel) < 0.42 ? "front" : Math.abs(rel) < 1.15 ? "q3" : "side");

/**
 * Seats around a round table: the viewer plus `others` people, evenly spaced around the whole circle.
 * Angles are measured from the viewer's seat, going from the viewer's left around to the right.
 */
function seatRing(others: number) {
  const n = others + 1;
  const step = (2 * Math.PI) / n;
  const angles = Array.from({ length: Math.max(0, others) }, (_, i) => (i + 1) * step);
  const rSeat = Math.max(0.47, 0.2 / Math.sin(Math.PI / n));
  return { rSeat, rTable: rSeat - 0.17, angles };
}

const CSS = `
.s3-root{position:relative;width:100%;height:100%;min-height:360px;overflow:hidden;background:${ROOM};font-family:var(--font-sans,"Inter"),"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;color:${INK};user-select:none;-webkit-user-select:none}
.s3-root canvas{display:block;width:100%!important;height:100%!important}
.s3-cap{position:absolute;right:14px;bottom:14px;max-width:min(78%,420px);background:#fff;color:${INK};border-radius:20px 20px 6px 20px;padding:10px 15px 11px;transition:opacity .25s ease,transform .25s ease}
.s3-cap.hidden{opacity:0;transform:translateY(8px)}
.s3-cap .who{display:none}
.s3-cap .line{font-size:18px;line-height:1.3;font-weight:500}
.s3-cap .flag{font-size:12px;color:#5f5a52;margin-top:3px}
.s3-mark{position:absolute;top:16px;right:18px;font-size:11px;color:#949494}
.s3-name{position:absolute;transform:translate(-50%,-50%);font-size:12px;font-weight:500;color:#b4b4b4;background:#111;border-radius:999px;padding:3px 9px 4px;white-space:nowrap;pointer-events:none;transition:opacity .3s,color .2s}
.s3-name.away{color:#949494}
.s3-name.talking{color:${LAMP}}
.s3-bubble{position:absolute;left:0;top:0;transform:translate(-50%,-100%);width:max-content;max-width:min(64%,300px);background:#fff;color:${INK};border-radius:18px;padding:9px 14px 10px;font-size:17px;line-height:1.3;font-weight:500;pointer-events:none;opacity:0;transition:opacity .2s ease;overflow-wrap:anywhere}
.s3-bubble::after{content:"";position:absolute;left:var(--tail,50%);bottom:-7px;margin-left:-8px;border:8px solid transparent;border-bottom:0;border-top-color:#fff}
.s3-bubble.on{opacity:1}
.s3-bubble.old{opacity:.0}
.s3-bubble .flag{display:block;font-size:12px;color:#5f5a52;margin-top:2px}
.s3-bubble.emoji{background:none;padding:0;font-size:46px;line-height:1}
.s3-bubble.emoji::after{display:none}
.s3-react{position:absolute;left:0;top:0;transform:translate(-50%,-100%) scale(.6);font-size:30px;line-height:1;pointer-events:none;opacity:0;transition:opacity .15s,transform .2s cubic-bezier(.2,1.6,.4,1)}
.s3-react.on{opacity:1;transform:translate(-50%,-100%) scale(1)}
@media (prefers-reduced-motion:reduce){.s3-cap,.s3-bubble,.s3-react{transition:none}}
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
  body: THREE.Group; // bounce and clay boil, pivot at the floor
  tilt: THREE.Group; // lean and nod, pivot at the stool top
  poses: Map<string, THREE.Object3D>; // poses and replacement frames, one visible at a time
  cards: Set<THREE.Object3D>; // flat cut-outs: always turned to the viewer
  rig: THREE.Group; // holds the cut-outs, turned to face the lens
  current: Pose; // the pose the director asked for
  shown: string; // the picture on screen right now (a pose or one of its replacement frames)
  frameKey: string; // the picture chosen at the last exposure, before the view (front, three-quarter, side) is applied
  seat: THREE.Vector3;
  yaw: number;
  turn: SCurve; // the turn in progress
  gaze: Figure | "camera" | null; // who this figure turns to (null: the table)
  speaking: boolean;
  mouth: number; // loudness of the line being said, 0..1
  flap: boolean;
  mouthFrame: string;
  blinkAt: number; // picture number of the next blink
  wake: number; // pictures left on the groggy "wake" frame
  boil: { x: number; z: number; r: number; s: number };
  hopT: number; // seconds since the line started (−1 = none)
  breathe: boolean;
  gesture: Gesture;
  gestureT: number;
  dim: number;
  targetDim: number;
  label: HTMLDivElement;
  bubble: HTMLDivElement; // what they are saying, above their head
  react: HTMLDivElement; // a listener's reaction, above their head
  materials: { m: THREE.MeshStandardMaterial; base: THREE.Color }[];
  k: number | null; // world units per image pixel, from the neutral cut-out
}

/**
 * One value moving on an S curve, the way an animator spaces a turn: slow out, fast through the middle, slow in.
 * Quintic Hermite from p0 (leaving at speed v0, so an interrupted move never stops dead) to p1 at rest. Times in ms.
 */
class SCurve {
  t0 = 0;
  dur = 0;
  p0: number;
  v0 = 0;
  p1: number;
  constructor(v: number) {
    this.p0 = this.p1 = v;
  }
  /** [value, velocity per ms] at time t */
  at(t: number): [number, number] {
    const u = this.dur > 0 ? Math.min(1, Math.max(0, (t - this.t0) / this.dur)) : 1;
    const u2 = u * u, u3 = u2 * u, u4 = u3 * u, u5 = u4 * u;
    const h5 = 10 * u3 - 15 * u4 + 6 * u5;
    const p = this.p0 + (this.p1 - this.p0) * h5 + this.v0 * this.dur * (u - 6 * u3 + 8 * u4 - 3 * u5);
    if (u >= 1 || this.dur <= 0) return [p, 0];
    const v = ((this.p1 - this.p0) * (30 * u2 - 60 * u3 + 30 * u4)) / this.dur + this.v0 * (1 - 18 * u2 + 32 * u3 - 15 * u4);
    return [p, v];
  }
  to(target: number, t: number, dur: number) {
    const [p, v] = this.at(t);
    this.p0 = p;
    this.v0 = (target - p) * v > 0 ? v : 0; // keep speed only if it already heads there
    this.p1 = target;
    this.t0 = t;
    this.dur = dur;
  }
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
  /** Clay relief: the silhouette inflated into a pillow, gw × gh heights 0..1 over the whole image. */
  relief: { hf: Float32Array; gw: number; gh: number } | null;
}

const RELIEF_GRID = 88;
const RELIEF_DEPTH = 0.075; // world units at the thickest point, for a figure about 0.8 tall

/**
 * Inflate a silhouette like a lump of clay: distance from the edge (two-pass chamfer), rounded over a radius,
 * so edges curve away from the light and the middle stays full.
 */
function inflate(inside: Uint8Array, gw: number, gh: number): Float32Array {
  const INF = 1e6;
  const d = new Float32Array(gw * gh);
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gw || y >= gh ? 0 : d[y * gw + x]);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (d[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
    }
  for (let y = gh - 1; y >= 0; y--)
    for (let x = gw - 1; x >= 0; x--) {
      const i = y * gw + x;
      if (d[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
    }
  const R = gw * 0.085;
  const hf = new Float32Array(gw * gh);
  for (let i = 0; i < hf.length; i++) {
    const t = Math.min(1, d[i] / R);
    hf[i] = d[i] ? Math.sqrt(1 - (1 - t) * (1 - t)) : 0;
  }
  // one box blur so cell steps do not show in the lamp light
  const out = new Float32Array(hf.length);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) (sum += hf[yy * gw + xx]), n++;
        }
      out[y * gw + x] = inside[y * gw + x] ? sum / n : 0;
    }
  return out;
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
        let relief: Cut["relief"] = null;
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
          relief = reliefOf(img, w, h);
        } catch {
          /* tainted or no canvas: use the whole image */
        }
        return { tex, w, h, top, bottom, relief };
      }),
    );
  }
  return cutCache.get(url)!;
}

/** The clay relief of a cut-out: its silhouette, read on a small grid, inflated like a lump of clay. */
function reliefOf(img: CanvasImageSource, w: number, h: number): Cut["relief"] {
  const gw = RELIEF_GRID, gh = Math.max(2, Math.round((RELIEF_GRID * h) / w));
  const c = document.createElement("canvas");
  c.width = gw;
  c.height = gh;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, gw, gh);
  const a = g.getImageData(0, 0, gw, gh).data;
  const inside = new Uint8Array(gw * gh);
  for (let i = 0; i < inside.length; i++) inside[i] = a[i * 4 + 3] > 127 ? 1 : 0;
  return { hf: inflate(inside, gw, gh), gw, gh };
}

/** Stand a cut-out up as a card, `k` world units per image pixel, the subject's feet on y=0. */
function makeCard(cut: Cut, k: number, depth = RELIEF_DEPTH): THREE.Object3D {
  const w = cut.w * k, h = cut.h * k;
  const r = cut.relief;
  const geo = r ? new THREE.PlaneGeometry(w, h, r.gw - 1, r.gh - 1) : new THREE.PlaneGeometry(w, h);
  if (r) {
    // push each vertex out by the clay relief (rows run top to bottom, like the image)
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, r.hf[i] * depth);
    geo.computeVertexNormals();
  }
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

// ───────────────────────── miniature lens ─────────────────────────

/**
 * Shallow depth of field, so the set reads as a miniature shot up close. The stock pass writes depth for whole
 * cut-out cards (transparent corners included); this one uses each mesh's own depth material, which honours alpha.
 */
class CutoutBokehPass extends BokehPass {
  private plain = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, blending: THREE.NoBlending });
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const self = this as any;
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    this.scene.traverseVisible((o: any) => {
      if (!o.isMesh) return;
      swapped.push([o, o.material]);
      o.material = o.customDepthMaterial ?? this.plain;
    });
    const oldClear = new THREE.Color();
    renderer.getClearColor(oldClear);
    const oldAlpha = renderer.getClearAlpha();
    const oldAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(0xffffff);
    renderer.setClearAlpha(1);
    renderer.setRenderTarget(self._renderTargetDepth);
    renderer.clear();
    const bg = this.scene.background;
    this.scene.background = null;
    renderer.render(this.scene, this.camera);
    this.scene.background = bg;
    for (const [m, mat] of swapped) m.material = mat;
    const u = this.uniforms as any;
    u.tColor.value = readBuffer.texture;
    u.nearClip.value = (this.camera as THREE.PerspectiveCamera).near;
    u.farClip.value = (this.camera as THREE.PerspectiveCamera).far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen) renderer.clear();
    self._fsQuad.render(renderer);
    renderer.setClearColor(oldClear);
    renderer.setClearAlpha(oldAlpha);
    renderer.autoClear = oldAuto;
  }
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
  private baseFov = 30;
  private fov = 30;
  private inset = 0; // px on the left of the picture that something covers (the chat strip on a wide screen)
  private insetGoal = 0;
  private shotCamera: Camera = "room";
  /** The camera move in progress: an S curve from where the camera was to the new shot (times in ms). */
  private move = { t0: 0, dur: 0, p0: new THREE.Vector3(), v0: new THREE.Vector3(), p1: new THREE.Vector3(0, TABLE_Y + 0.1, -0.3), f0: 56, fv0: 0, f1: 56 };
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
  private focusTo: Figure | "camera" | null = "camera";
  private lineSeq = 0;
  private lastSpeaker: Figure | null = null;
  private lastStep = 0;
  private lastRender = 0;
  private step = 0;
  private lamp: THREE.SpotLight | null = null;
  private composer: EffectComposer | null = null;
  private bokeh: CutoutBokehPass | null = null;
  private lampBase = 1;
  private roomFlicker: miniSet.SetLights["flicker"] = [];
  private props: THREE.Object3D[] = []; // cut-out props on the table, turned to the viewer like the figures
  private tableToken = 0;
  private tableFlicker: miniSet.SetLights["flicker"] = [];
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
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    root.prepend(r.domElement);
    this.renderer = r;

    this.buildRoom();
    this.scene.add(this.table);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.03, 30);
    try {
      const composer = new EffectComposer(r);
      composer.addPass(new RenderPass(this.scene, this.camera));
      this.bokeh = new CutoutBokehPass(this.scene, this.camera, { focus: 1.2, aperture: 0.006, maxblur: 0.01 });
      composer.addPass(this.bokeh);
      composer.addPass(new OutputPass());
      this.composer = composer;
    } catch {
      this.composer = null; // plain rendering
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.layout();
    this.resize();
    r.setAnimationLoop(() => this.frame());
  }

  // ───────── layout ─────────

  /** A miniature dining room: wallpaper over walnut boards, floorboards, a window onto the night, a pendant lamp. */
  private buildRoom() {
    const sc = this.scene;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    sc.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = 0.16;
    const lights = miniSet.buildRoom(sc);
    this.lamp = lights.lamp;
    this.lampBase = lights.lamp.intensity;
    this.roomFlicker = lights.flicker;
  }

  /** The table, laid for everyone at it (cake, teapot, a place at each seat including yours). */
  private buildTable() {
    this.table.clear();
    this.props = [];
    const { rTable, angles } = this.ring;
    const t = miniSet.buildTable(rTable, TABLE_Y);
    this.table.add(t.group);
    this.tableFlicker = t.flicker;
    // the props are Muse Image cut-outs like the figures: a cake in the middle, a teapot, a place at every seat
    const seats = [...angles.map((a) => new THREE.Vector3(Math.sin(-a), 0, Math.cos(-a))), new THREE.Vector3(0, 0, 1)];
    const place: [string, THREE.Vector3, number][] = [
      ["cake", new THREE.Vector3(0, TABLE_Y, -0.03), 0.15],
      ["teapot", new THREE.Vector3(-0.13, TABLE_Y, 0.02), 0.058],
    ];
    for (const d of seats) {
      const side = new THREE.Vector3(-d.z, 0, d.x);
      const at = d.clone().multiplyScalar(rTable - 0.085).setY(TABLE_Y);
      place.push(["plate", at, 0.022], ["cup", at.clone().addScaledVector(side, 0.075).addScaledVector(d, -0.02), 0.042]);
    }
    const token = ++this.tableToken;
    for (const [name, at, height] of place)
      void loadCut(miniSet.setUrl(name)).then((cut) => {
        if (token !== this.tableToken || this.disposed) return;
        const card = makeCard(cut, height / Math.max(1, cut.bottom - cut.top), height * 0.12);
        card.position.copy(at);
        card.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.receiveShadow = true) : null));
        this.table.add(card);
        this.props.push(card);
      });
  }

  private resize() {
    const w = this.root.clientWidth || 360;
    const h = this.root.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.applyView();
    // a normal lens from further back, not a wide one up close: straight lines stay straight, faces keep their shape
    // (portrait phones get a little more height so the speaker fits)
    this.baseFov = w / h >= 1 ? 34 : 42;
    this.shot(this.focus, this.shotCamera, this.focusTo, true); // a new frame size cuts straight to the shot
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  /** An off-centre lens (a view offset) that frames the table in the part of the picture nothing covers. */
  private applyView() {
    const w = this.root.clientWidth || 360, h = this.root.clientHeight || 640;
    this.camera.aspect = (w + this.inset) / h;
    if (this.inset > 0.5) this.camera.setViewOffset(w + this.inset, h, 0, 0, w, h);
    else this.camera.clearViewOffset();
  }

  /** Something lies over the left of the stage (the chat strip on a wide screen): keep the table in the rest. */
  setInset(px: number) {
    this.insetGoal = Math.max(0, px);
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
    const sameCast = members.length === prev.size && members.every((m) => prev.has(m.id) && prev.get(m.id)!.name === m.name);
    if (!sameCast) this.layout();
    else
      for (const m of members) {
        // figures arrive a pose or a frame at a time: swap in only what changed
        const f = this.figures.get(m.id);
        if (!f) continue;
        const old = f.member.figure ?? {}, nu = m.figure ?? {};
        const neutralChanged = JSON.stringify(old.neutral ?? null) !== JSON.stringify(nu.neutral ?? null) || f.member.personaUrl !== m.personaUrl;
        const changed = [...new Set([...Object.keys(old), ...Object.keys(nu)])].filter((key) => JSON.stringify(old[key] ?? null) !== JSON.stringify(nu[key] ?? null));
        f.member = { ...m, present: f.member.present };
        if (neutralChanged) void this.reloadFigure(f);
        else for (const key of changed) void this.loadInto(f, key);
      }
    for (const m of members) this.setPresence(m.id, m.present);
  }

  private clearFigures() {
    for (const f of this.figures.values()) {
      this.scene.remove(f.group);
      f.label.remove();
      f.bubble.remove();
      f.react.remove();
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
    this.camPos.set(0, EYE_Y, rSeat + 1.05); // pulled back behind your chair, so a normal lens takes in the seats beside you
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
    const rig = new THREE.Group();
    rig.position.y = -PIVOT_Y;
    tilt.add(rig);
    group.position.copy(seat);
    this.scene.add(group);
    const label = document.createElement("div");
    label.className = "s3-name";
    label.dataset.m = member.id;
    label.textContent = member.name;
    this.root.appendChild(label);
    const bubble = document.createElement("div");
    bubble.className = "s3-bubble";
    const react = document.createElement("div");
    react.className = "s3-react";
    this.root.append(bubble, react);
    const f: Figure = {
      member,
      group,
      body,
      tilt,
      poses: new Map(),
      cards: new Set(),
      rig,
      current: member.present ? "neutral" : "away",
      shown: "",
      frameKey: "neutral",
      seat: seat.clone(),
      yaw: 0,
      turn: new SCurve(0),
      gaze: null,
      speaking: false,
      mouth: 0,
      flap: false,
      mouthFrame: "neutral",
      blinkAt: this.step + 12 + Math.floor(Math.random() * 36),
      wake: 0,
      boil: { x: 0, z: 0, r: 0, s: 1 },
      hopT: -1,
      breathe: false,
      gesture: "none",
      gestureT: 0,
      dim: member.present ? 0 : 1,
      targetDim: member.present ? 0 : 1,
      label,
      bubble,
      react,
      materials: [],
      k: null,
    };
    f.yaw = this.yawTo(seat, CENTER);
    f.turn = new SCurve(f.yaw);
    group.rotation.y = f.yaw;
    void this.loadPoses(f, i);
    return f;
  }

  private imgUrl(f: Figure, key: string): string | null {
    const fig = f.member.figure ?? {};
    return fig[key]?.img ?? (key === "neutral" ? f.member.personaUrl : key === "away" ? f.member.awayUrl : null) ?? null;
  }

  /** Load one pose or frame of a figure as a mesh (when there is one) or a cut-out card, at the figure's scale. */
  private async loadKey(f: Figure, key: string): Promise<THREE.Object3D | null> {
    const url = this.imgUrl(f, key);
    const cut = url ? await loadCut(url).catch(() => null) : null;
    const k = f.k ?? (cut ? FIG_H / Math.max(1, cut.bottom - cut.top) : null);
    const glb = f.member.figure?.[key]?.glb;
    if (glb) {
      try {
        return await loadGlb(glb, cut && k ? (cut.bottom - cut.top) * k : FIG_H);
      } catch {
        /* fall back to the card */
      }
    }
    return cut && k ? makeCard(cut, k) : null;
  }

  private dropObject(f: Figure, old: THREE.Object3D) {
    old.parent?.remove(old);
    f.cards.delete(old);
    f.materials = f.materials.filter(({ m }) => {
      let keep = true;
      old.traverse((x: any) => x.material === m && (keep = false));
      return keep;
    });
  }

  private keepMaterials(f: Figure, o: THREE.Object3D) {
    o.traverse((x: any) => {
      if (x.isMesh && x.material && "color" in x.material) f.materials.push({ m: x.material, base: x.material.color.clone() });
    });
  }

  private addKey(f: Figure, key: string, o: THREE.Object3D) {
    const old = f.poses.get(key);
    if (old) this.dropObject(f, old);
    o.visible = false;
    // cut-outs ride the rig (turned to the lens); a mesh stands in the tilt group as it is
    if (o.userData.card) {
      o.position.set(0, 0, 0);
      f.rig.add(o);
      f.cards.add(o);
    } else {
      o.position.y = -PIVOT_Y;
      f.tilt.add(o);
    }
    f.poses.set(key, o);
    this.keepMaterials(f, o);
    f.shown = "";
  }

  private async loadInto(f: Figure, key: string) {
    const o = await this.loadKey(f, key);
    if (o && !this.disposed && this.figures.get(f.member.id) === f) this.addKey(f, key, o);
  }

  private async reloadFigure(f: Figure) {
    for (const o of f.poses.values()) o.parent?.remove(o);
    f.poses.clear();
    f.cards.clear();
    f.materials = [];
    f.shown = "";
    f.k = null;
    await this.loadPoses(f, [...this.figures.values()].indexOf(f));
  }

  private async loadPoses(f: Figure, i: number) {
    const fig = f.member.figure ?? {};
    const poses: Pose[] = ["neutral", "happy", "laughing", "surprised", "angry", "sad", "away"];
    // one scale per figure, from the neutral pose: a slumped or leaning pose keeps its true size
    const nUrl = this.imgUrl(f, "neutral");
    if (nUrl) {
      try {
        const n = await loadCut(nUrl);
        f.k = FIG_H / Math.max(1, n.bottom - n.top);
      } catch {
        /* no neutral image */
      }
    }
    // neutral and away first (visible immediately), then the other poses, then the replacement frames
    for (const batch of [["neutral", "away"], poses.filter((p) => p !== "neutral" && p !== "away"), FRAMES.filter((x) => fig[x])] as string[][]) {
      const objs = await Promise.all(batch.map((key) => this.loadKey(f, key)));
      if (this.disposed) return;
      batch.forEach((key, j) => objs[j] && this.addKey(f, key, objs[j]!));
      if (!f.poses.has("neutral")) this.addKey(f, "neutral", defaultFigure((Math.max(0, i) * 0.17) % 1));
      this.showFrame(f, f.current);
    }
  }

  private resolvePose(f: Figure, pose: Pose): Pose {
    if (f.poses.has(pose)) return pose;
    for (const p of POSE_FALLBACK[pose]) if (f.poses.has(p)) return p;
    return "neutral";
  }

  /** The director's pose for this figure; the picture follows on the next frame. */
  private showPose(f: Figure, pose: Pose) {
    f.current = pose;
    f.flap = false;
    f.mouthFrame = pose;
    this.showFrame(f, pose);
  }

  /** The picture to show for a frame name: the replacement frame if this figure has it, else the pose it belongs to. */
  private resolveKey(f: Figure, name: string): string {
    if (f.poses.has(name)) return name;
    const base = name === "talk_a" || name === "talk_b" || name === "blink" ? "neutral" : name === "wake" ? "away" : name.replace(/_b$/, "");
    return this.resolvePose(f, base as Pose);
  }

  /** Put a picture on screen at the next frame (the view is worked out there). */
  private showFrame(f: Figure, name: string) {
    f.frameKey = name;
  }

  /**
   * Dress the puppet for this frame: the turnaround view it has toward the lens (a turned figure that is talking
   * shows its talking view), mirrored when it faces the other way.
   */
  private dress(f: Figure, still: boolean, rel: number) {
    const K = this.resolveKey(f, f.frameKey);
    const view = still ? "front" : viewOf(rel);
    const open = f.speaking && (f.mouthFrame === "talk_a" || f.mouthFrame === "talk_b" || f.mouthFrame.endsWith("_b"));
    const key = view === "front" ? K : open && f.poses.has(`${view}_talk`) ? `${view}_talk` : f.poses.has(view) ? view : K;
    // a view faces the right of the picture; mirror it when this figure faces the other way
    const mirror = view !== "front" && rel > 0;
    const sig = `${key}|${mirror}`;
    if (sig === f.shown) return;
    f.shown = sig;
    for (const [p, o] of f.poses) {
      o.visible = p === key;
      if (o.visible && o.userData.card) o.scale.x = mirror ? -1 : 1;
    }
  }

  /** Where this figure turns (world yaw): to the one it looks at, else to the table. */
  private gazeYaw(f: Figure): number {
    if (f.dim > 0.5 || f.wake > 0 || !f.gaze) return this.yawTo(f.seat, CENTER);
    return this.yawTo(f.group.position, f.gaze === "camera" ? this.camPos : f.gaze.group.position);
  }

  /** Which picture this figure shows on this frame: mouths follow the voice, laughs cycle, people blink. */
  private pickFrame(f: Figure): string {
    const s = this.step;
    const base = f.current;
    if (f.wake > 0) {
      f.wake--;
      return "wake";
    }
    if (base === "laughing") return Math.floor(s / 3) % 2 ? "laughing_b" : "laughing";
    if (f.speaking) {
      if (s % 2 === 0) {
        // replacement mouths, held for two pictures each
        if (base === "neutral") f.mouthFrame = f.mouth > 0.45 ? "talk_a" : f.mouth > 0.12 ? "talk_b" : "neutral";
        else {
          f.flap = f.mouth > 0.18 ? !f.flap : false;
          f.mouthFrame = f.flap ? `${base}_b` : base;
        }
      }
      return f.mouthFrame;
    }
    if (base === "neutral" && f.dim < 0.5) {
      if (s >= f.blinkAt + 2) f.blinkAt = s + 24 + Math.floor(Math.random() * 48);
      if (s >= f.blinkAt) return "blink";
    }
    return base;
  }

  /** Asleep → awake (or back): a couple of groggy pictures in between. */
  private stir(f: Figure) {
    f.wake = 3;
  }

  private yawTo(from: THREE.Vector3, to: THREE.Vector3): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  /** Back to the table at rest: present members face the table, absent ones sleep. */
  private rest(o: Figure) {
    if (!o.member.present && o.current !== "away") this.stir(o);
    this.showPose(o, o.member.present ? "neutral" : "away");
    o.targetDim = o.member.present ? 0 : 1;
    o.gaze = null;
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
    const now = performance.now();
    if (now - this.lastRender < 1000 / RENDER_FPS - 4) return;
    this.lastRender = now;
    // the puppets move only on every other picture: stop motion on twos, while the camera glides on ones
    const exposure = now - this.lastStep >= 1000 / FPS - 4;
    if (exposure) {
      this.lastStep = now;
      this.step++;
    }
    const s = this.step;
    const dt = 1 / FPS;
    for (const p of this.props) p.rotation.y = Math.atan2(this.camPos.x - p.position.x, this.camPos.z - p.position.z);
    this.sampleMove(now);
    if (Math.abs(this.insetGoal - this.inset) > 0.5) {
      this.inset += (this.insetGoal - this.inset) * 0.18;
      if (Math.abs(this.insetGoal - this.inset) < 1) this.inset = this.insetGoal;
      this.applyView();
    }
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.camPos);
    // with the left of the picture covered, step back along the lens so the uncovered part still holds the whole shot
    if (this.inset > 0.5) {
      const w = this.root.clientWidth || 360;
      const back = this.camPos.distanceTo(this.look) * (w / Math.max(1, w - this.inset) - 1);
      this.camera.position.addScaledVector(this.camPos.clone().sub(this.look).normalize(), back);
    }
    this.camera.lookAt(this.look);
    // set lights drift a hair between exposures
    if (exposure && this.lamp) this.lamp.intensity = this.lampBase * (1 + (Math.random() - 0.5) * 0.035);
    if (exposure) for (const fl of [...this.roomFlicker, ...this.tableFlicker]) fl.light.intensity = fl.base * (1 + (Math.random() - 0.5) * fl.amount);
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const v = new THREE.Vector3();
    const { rSeat, rTable } = this.ring;
    for (const f of this.figures.values()) {
      const asleep = f.dim > 0.5;
      if (exposure) this.animate(f, now, s, dt, rTable, rSeat);
      // cut-outs always face the lens; what turns is the picture: front, three-quarter or side (a stop-motion
      // puppet's turnaround)
      const rel = wrapPi(this.yawTo(f.group.position, this.camPos) - f.yaw);
      f.rig.rotation.y = rel;
      this.dress(f, asleep || f.wake > 0, rel);
      // name card on the figure's own chest, so it can only ever sit on its own figure (and never on the cake)
      v.copy(f.group.position).setY(FIG_H * 0.7).project(this.camera);
      const onScreen = v.z < 1 && v.x > -1.1 && v.x < 1.1;
      f.label.style.left = `${((v.x + 1) / 2) * w}px`;
      f.label.style.top = `${((1 - v.y) / 2) * h}px`;
      f.label.classList.toggle("away", asleep);
      f.label.classList.toggle("talking", f.speaking);
      f.label.style.opacity = onScreen ? "1" : "0";
      // the speech bubble and the reaction ride just above the head, kept inside the frame
      v.copy(f.group.position).setY(FIG_H * (asleep ? 0.62 : 0.98) + 0.03).project(this.camera);
      const hx = ((v.x + 1) / 2) * w, hy = ((1 - v.y) / 2) * h;
      const bw = f.bubble.offsetWidth || 120;
      const bx = Math.min(w - 12 - bw / 2, Math.max(12 + bw / 2, hx));
      f.bubble.style.left = `${bx}px`;
      f.bubble.style.top = `${Math.max(f.bubble.offsetHeight + 60, hy)}px`; // clear of the controls along the top
      f.bubble.style.setProperty("--tail", `${Math.min(bw - 18, Math.max(18, bw / 2 + hx - bx))}px`);
      f.react.style.left = `${hx}px`;
      f.react.style.top = `${Math.max(40, hy)}px`;
    }
    if (this.composer && this.bokeh) {
      // focus on whatever the viewer is looking at (the speaker, or the far side of the table)
      (this.bokeh.uniforms as any).focus.value = this.camera.position.distanceTo(this.look);
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
  }

  /** One exposure of a puppet: its turn, bounce, clay boil, breath, gesture, dimming and which picture it shows. */
  private animate(f: Figure, now: number, s: number, dt: number, rTable: number, rSeat: number) {
    {
      // the figure turns on its stool on an S curve; a quarter turn takes about half a second
      const dy = wrapPi(this.gazeYaw(f) - f.turn.p1);
      if (Math.abs(dy) > 1e-3) f.turn.to(f.turn.p1 + dy, now, (Math.min(0.9, 0.28 + 0.38 * Math.abs(dy)) * 1000) / (this.current?.speed ?? 1));
      f.yaw = f.turn.at(now)[0];
      f.group.rotation.y = f.yaw;
      // a small bounce when a line starts
      let hop = 0;
      if (f.hopT >= 0) {
        f.hopT += dt;
        hop = f.hopT < 0.34 ? Math.sin((f.hopT / 0.34) * Math.PI) * 0.022 : 0;
      }
      // clay boil: the figure was touched between every other exposure
      if (s % 2 === 0) f.boil = { x: (Math.random() - 0.5) * 0.003, z: (Math.random() - 0.5) * 0.003, r: (Math.random() - 0.5) * 0.012, s: 1 + (Math.random() - 0.5) * 0.008 };
      const asleep = f.dim > 0.5;
      const breath = asleep ? Math.sin((s / FPS) * 1.6 + f.seat.x * 5) * 0.01 : f.breathe ? Math.sin((s / FPS) * 4) * 0.02 : 0;
      f.body.position.set(f.boil.x, hop, f.boil.z);
      f.body.scale.set(f.boil.s, f.boil.s * (1 + breath), f.boil.s);
      // lean and nod around the stool top
      f.gestureT += dt;
      let tiltX = 0, wig = 0;
      if (f.gesture === "nod") tiltX += Math.sin(f.gestureT * 9) * 0.1 * Math.max(0, 1 - f.gestureT / 1.2);
      if (f.gesture === "shake") wig = Math.sin(f.gestureT * 14) * 0.16 * Math.max(0, 1 - f.gestureT / 1.0);
      if (f.gesture === "lean_in") tiltX += 0.12;
      if (f.gesture === "step_back") tiltX -= 0.07;
      f.tilt.rotation.set(tiltX, wig, f.boil.r);
      f.dim += (f.targetDim - f.dim) * 0.4;
      // asleep: pulled in to the table, slumped over its edge
      f.group.position.copy(f.seat).multiplyScalar(1 - (0.08 * f.dim * rTable) / rSeat);
      for (const { m, base } of f.materials) m.color.copy(base).multiplyScalar(1 - 0.3 * f.dim);
      f.frameKey = this.pickFrame(f);
    }
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

  /**
   * A friend's line goes in a bubble above their head (an emoji-only line is the emoji itself, large);
   * your own line sits at the bottom of the screen, where you said it.
   */
  private showCaption(item: PerformItem) {
    const check = this.quiet || item.status !== "captions_only" ? "" : item.flags?.includes("voice_disabled") ? "Captions only" : "Voice failed the read-back check · captions only";
    const flag = [item.frame && `Frame ${item.frame}`, check].filter(Boolean).join(" · ");
    for (const o of this.figures.values()) o.bubble.classList.remove("on");
    const f = item.memberId === this.viewerId ? null : this.figures.get(item.memberId);
    if (!f) {
      (this.caption.querySelector(".line") as HTMLElement).textContent = item.text;
      (this.caption.querySelector(".flag") as HTMLElement).textContent = flag;
      this.caption.classList.remove("hidden");
      return;
    }
    this.caption.classList.add("hidden");
    const emojiOnly = /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\s]+$/u.test(item.text) && [...item.text.trim()].length <= 8;
    f.bubble.classList.toggle("emoji", emojiOnly);
    f.bubble.textContent = item.text;
    if (flag && !emojiOnly) {
      const s = document.createElement("span");
      s.className = "flag";
      s.textContent = flag;
      f.bubble.appendChild(s);
    }
    f.bubble.classList.add("on");
  }
  hideCaption() {
    this.caption.classList.add("hidden");
    for (const o of this.figures.values()) {
      o.bubble.classList.remove("on");
      o.react.classList.remove("on");
    }
  }

  /** A listener's reaction as one emoji above their head, for the length of the line. */
  private showReaction(o: Figure, pose: Pose | null) {
    const e = pose ? REACTION_EMOJI[pose] : undefined;
    o.react.textContent = e ?? "";
    o.react.classList.toggle("on", !!e);
  }

  /**
   * Where the viewer looks. The camera frames the exchange, not only the speaker: a line said to you frames the
   * speaker; a line said to someone else frames the two of them (the speaker favoured), so you see the look land;
   * a line to the whole table stays wide. While two people go back and forth the shot holds (see aim).
   */
  private shot(f: Figure | null, camera: Camera, to: Figure | "camera" | null = "camera", snap = false) {
    this.focus = f;
    this.focusTo = to;
    this.shotCamera = camera;
    const portrait = this.portrait();
    const rest = new THREE.Vector3(0, portrait ? 0.56 : 0.48, -this.ring.rSeat * 0.6);
    const face = (o: Figure) => new THREE.Vector3(o.seat.x, portrait ? 0.58 : 0.52, o.seat.z);
    const fov = this.baseFov * (camera === "close" ? 0.9 : 1);
    const other = to && to !== "camera" && to !== f ? to : null;
    if (!f && this.figures.size === 1) {
      // one person across the table (the figure preview): look at them, closer
      const only = [...this.figures.values()][0];
      this.aim(new THREE.Vector3(only.seat.x, 0.48, only.seat.z), this.baseFov * 0.62, snap);
    } else if (!f && other) {
      // you are talking to a friend: you turn to them
      this.aim(rest.clone().lerp(face(other), portrait ? 0.85 : 0.45), fov, snap);
    } else if (!f && portrait) {
      // an upright phone sees one or two people: rest on whoever spoke last (or the first friend awake), not on a sleeper
      const awake = [...this.figures.values()].filter((o) => o.member.present);
      const who = this.lastSpeaker && this.lastSpeaker.member.present ? this.lastSpeaker : awake[0];
      this.aim(who ? rest.clone().lerp(new THREE.Vector3(who.seat.x, 0.58, who.seat.z), 0.8) : rest, this.baseFov, snap);
    } else if (!f) {
      this.aim(rest, this.baseFov, snap);
    } else if (other) {
      // a two-shot of the speaker and the one they are talking to, when the frame is wide enough for both;
      // otherwise the speaker, nudged toward the one they look at
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * this.camera.aspect);
      const apart = face(f).sub(this.camPos).angleTo(face(other).sub(this.camPos));
      const both = apart < hfov * 0.75;
      this.aim(rest.clone().lerp(face(f).lerp(face(other), both ? 0.42 : 0.12), portrait ? 0.88 : 0.62), fov, snap);
    } else {
      this.aim(rest.clone().lerp(face(f), portrait ? 0.85 : to === "camera" ? 0.5 : 0.36), fov, snap);
    }
  }

  /**
   * Move the camera to a new shot the way a motion-control rig does: an S curve that eases out of rest and
   * into the new framing. A move that interrupts another keeps its speed, so the camera never stops dead mid-pan.
   */
  private aim(target: THREE.Vector3, fov: number, snap = false) {
    const m = this.move;
    // hold the shot when the new one is within a few degrees: two people going back and forth keep one frame
    if (!snap && m.p1.clone().sub(this.camPos).angleTo(target.clone().sub(this.camPos)) < 0.07 && Math.abs(m.f1 - fov) < 0.5) return;
    const now = performance.now();
    const v = new THREE.Vector3();
    const fv = this.sampleMove(now, v);
    m.p0.copy(this.look);
    m.f0 = this.fov;
    m.p1.copy(target);
    m.f1 = fov;
    m.t0 = now;
    if (snap) {
      m.dur = 0;
      this.look.copy(target);
      this.fov = fov;
      return;
    }
    // an unhurried head turn: about a second to the person beside you, never more than 1.8 s
    const angle = this.look.clone().sub(this.camPos).angleTo(target.clone().sub(this.camPos));
    m.dur = (Math.min(1.8, 0.85 + 0.9 * angle + 0.8 * Math.abs(Math.log(fov / this.fov))) * 1000) / (this.current?.speed ?? 1);
    // keep only the part of the old speed that already heads toward the new shot
    const d = target.clone().sub(this.look);
    m.v0.copy(d).multiplyScalar(d.lengthSq() > 1e-8 ? Math.max(0, v.dot(d) / d.lengthSq()) : 0);
    m.fv0 = Math.sign(fov - this.fov) === Math.sign(fv) ? fv : 0;
  }

  /** Put the camera where the move has it at time t. Writes the look velocity (per ms) to `vel` and returns the zoom velocity. */
  private sampleMove(t: number, vel?: THREE.Vector3): number {
    const m = this.move;
    const u = m.dur > 0 ? Math.min(1, Math.max(0, (t - m.t0) / m.dur)) : 1;
    const u2 = u * u, u3 = u2 * u, u4 = u3 * u, u5 = u4 * u;
    // quintic Hermite: leave p0 at speed v0, arrive at p1 at rest with no jolt (with v0 = 0 it is smootherstep)
    const h0 = 1 - 10 * u3 + 15 * u4 - 6 * u5;
    const h1 = (u - 6 * u3 + 8 * u4 - 3 * u5) * m.dur;
    const h5 = 1 - h0;
    this.look.set(0, 0, 0).addScaledVector(m.p0, h0).addScaledVector(m.v0, h1).addScaledVector(m.p1, h5);
    this.fov = m.f0 * h0 + m.fv0 * h1 + m.f1 * h5;
    if (!vel || m.dur <= 0 || u >= 1) {
      vel?.set(0, 0, 0);
      return 0;
    }
    const d0 = (-30 * u2 + 60 * u3 - 30 * u4) / m.dur;
    const d1 = 1 - 18 * u2 + 32 * u3 - 15 * u4;
    vel.set(0, 0, 0).addScaledVector(m.p0, d0).addScaledVector(m.v0, d1).addScaledVector(m.p1, -d0);
    return m.f0 * d0 + m.fv0 * d1 - m.f1 * d0;
  }

  // ───────── perform ─────────

  async perform(item: PerformItem, opts: { speed?: number; signal?: { cancelled: boolean; skip: boolean } } = {}): Promise<void> {
    const speed = opts.speed ?? 1;
    const signal = opts.signal ?? { cancelled: false, skip: false };
    const seq = ++this.lineSeq;
    (window as any).__sceneLog ??= [];
    (window as any).__sceneLog.push({ t: Date.now(), id: item.messageId, member: item.memberId, status: item.status });
    // null when the viewer is the one talking: there is no figure, everyone looks at the camera
    const f = item.memberId === this.viewerId ? null : this.figures.get(item.memberId) ?? null;
    const others = [...this.figures.values()].filter((x) => x !== f);
    // who the line is for: you (the lens), a friend at the table, or everyone (no one in particular)
    const toId = item.to == null ? this.viewerId ?? "viewer" : item.to;
    const to: Figure | "camera" | null =
      item.to == null || toId === this.viewerId ? "camera" : toId === "all" ? null : this.figures.get(toId) ?? null;
    if (f) {
      this.lastSpeaker = f;
      if (f.current === "away") this.stir(f);
      f.speaking = true;
      f.breathe = false;
      f.targetDim = 0;
      f.gaze = to === f ? null : to; // turns to whoever the line is for
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
      this.showReaction(o, r ? r.pose : null);
      if (r) {
        if (o.current === "away" && r.pose !== "away") this.stir(o);
        o.targetDim = 0;
        this.showPose(o, r.pose);
      } else {
        if (!o.member.present && o.current !== "away") this.stir(o);
        this.showPose(o, o.member.present ? "neutral" : "away");
      }
      if (!r && !o.member.present) o.targetDim = 1;
      const look = r?.look ?? (awake ? "speaker" : "down");
      // listeners turn to the speaker (you, when you are the one talking)
      o.gaze = look === "camera" || (look === "speaker" && !f) ? "camera" : look === "speaker" ? f : null;
      o.gesture = "none";
    }
    this.shot(f, item.camera, to);
    this.showCaption(item);

    const dur = itemDuration(item) / speed;
    // turn to the speaker: the line starts while everyone is still turning, the way you turn to someone talking
    const settling = this.move.t0 + this.move.dur * 0.5 - performance.now();
    await new Promise((r) => setTimeout(r, Math.min(700 / speed, Math.max(380 / speed, settling))));
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
          f.mouth =
            item.status === "silent" ? 0 : env.length ? env[Math.min(env.length - 1, Math.floor((elapsed / 1000) * ENV_FPS))] ?? 0 : audio ? 0.4 : 0.3 + 0.3 * Math.sin(elapsed / 110);
        }
        const ended = audio ? audio.ended || (audio.paused && audio.currentTime > 0) : performance.now() - t0 >= dur;
        if (ended) return resolve();
        setTimeout(tick, 33);
      };
      setTimeout(tick, 0);
    });
    if (audio && !audio.ended) audio.pause();
    if (f) {
      f.mouth = 0;
      f.hopT = -1;
      f.speaking = false;
      f.gesture = "none";
      // still awake after talking, even someone who is not connected: the next line decides if they doze off
      this.showPose(f, "neutral");
    }
    for (const o of this.figures.values()) o.react.classList.remove("on");
    // the bubble stays a moment after the line, unless the next line has already started
    setTimeout(() => this.lineSeq === seq && this.hideCaption(), 2600 / speed);
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
    this.composer?.dispose();
    this.renderer.dispose();
    this.root.remove();
  }
}

export function createStage(container: HTMLElement, opts: StageOptions): Stage {
  return new Stage(container, opts);
}
