// Scene stage in 3D, first person, shot like a stop-motion film: you sit at a round table in a miniature dining room
// with your friends as seated clay figurines (SAM 3D meshes). Everything moves twelve pictures a second; mouths,
// blinks and laughs are replacement frames (Muse Image edits) swapped in like stop-motion faces; the clay boils.
// You turn to whoever is talking; listeners turn and react as the director says; absent friends sleep slumped over.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

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

const ROOM = "#d9d1c4";
const INK = "#1b1815";
const FIG_H = 0.8; // a seated figure on its stool, floor to the top of the head
const PIVOT_Y = 0.2; // the stool top: figures lean and nod around it
const TABLE_Y = 0.34; // table top
const EYE_Y = 0.7; // the viewer's eyes, a little above everyone else's so the table reads
const CENTER = new THREE.Vector3(0, TABLE_Y, 0);
const ENV_FPS = 30;
const FPS = 12; // stop motion: a new picture twelve times a second (animated "on twos")
const FRAMES = ["talk_a", "talk_b", "blink", "wake", "happy_b", "laughing_b", "surprised_b", "angry_b", "sad_b"];
const ROOM_R = 2.3; // the miniature dining room around the table
const WALL_H = 1.8;
const WAINSCOT_H = 0.5;

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
  g.fillStyle = "#7e4f2b";
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

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Specks of grit and paper fibre, so surfaces read as made things. */
function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, light = false) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = light ? `rgba(255,240,210,${Math.random() * 0.08})` : `rgba(30,15,5,${Math.random() * 0.1})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/** Mustard stripe wallpaper with a small diamond, printed slightly off-register. */
function wallpaperTexture(repeat: [number, number]) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = "#bd8c3c";
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 64) {
      g.fillStyle = "#ad7c31";
      g.fillRect(x + 32, 0, 32, 256);
      g.fillStyle = "rgba(236,200,130,.35)";
      g.fillRect(x + 31, 0, 1.5, 256);
      for (let y = 16; y < 256; y += 64) {
        const cx = x + 48 + (Math.random() - 0.5), cy = y + (Math.random() - 0.5);
        g.fillStyle = "#8a5f22";
        g.beginPath();
        g.moveTo(cx, cy - 7);
        g.lineTo(cx + 5, cy);
        g.lineTo(cx, cy + 7);
        g.lineTo(cx - 5, cy);
        g.fill();
        g.fillStyle = "#d9ae62";
        g.fillRect(cx - 1, cy + 30, 2, 2);
      }
    }
    speckle(g, 256, 256, 900);
    speckle(g, 256, 256, 300, true);
  }, repeat);
}

/** Dark walnut boards for the lower wall. */
function wainscotTexture(repeat: [number, number]) {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = "#4e301d";
    g.fillRect(0, 0, 256, 128);
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = `rgba(${70 + Math.random() * 20},${42 + Math.random() * 10},24,.5)`;
      g.fillRect(x + 2, 0, 28, 128);
      g.fillStyle = "rgba(20,10,4,.7)";
      g.fillRect(x, 0, 2, 128);
      g.fillStyle = "rgba(200,150,100,.12)";
      g.fillRect(x + 2, 0, 1, 128);
    }
    speckle(g, 256, 128, 500);
  }, repeat);
}

/** Floorboards. */
function floorTexture(repeat: [number, number]) {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = "#5e3b23";
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 48) {
      let x = -Math.random() * 200;
      while (x < 512) {
        const len = 160 + Math.random() * 220;
        g.fillStyle = `rgb(${88 + Math.random() * 22},${56 + Math.random() * 14},${32 + Math.random() * 8})`;
        g.fillRect(x + 1, y + 1, len - 2, 46);
        g.strokeStyle = "rgba(40,22,10,.25)";
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          const yy = y + 6 + Math.random() * 36;
          g.moveTo(x, yy);
          g.bezierCurveTo(x + len / 3, yy + 3, x + (2 * len) / 3, yy - 3, x + len, yy);
          g.stroke();
        }
        x += len;
      }
      g.fillStyle = "rgba(20,10,4,.8)";
      g.fillRect(0, y, 512, 2);
    }
    speckle(g, 512, 512, 1500);
  }, repeat);
}

/** A round rug: rust field, ochre and umber bands, a ring of diamonds. */
function rugTexture() {
  return canvasTex(512, 512, (g) => {
    const c = 256;
    const ring = (r: number, col: string) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.fill();
    };
    ring(256, "#3a2418");
    ring(244, "#c49a45");
    ring(226, "#7e3220");
    ring(206, "#3a2418");
    ring(198, "#8f3d24");
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = c + Math.cos(a) * 216, y = c + Math.sin(a) * 216;
      g.fillStyle = "#d8b25e";
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x + 5, y);
      g.lineTo(x, y + 6);
      g.lineTo(x - 5, y);
      g.fill();
    }
    ring(120, "#a5512e");
    ring(110, "#8f3d24");
    // woven texture
    for (let y = 0; y < 512; y += 3) {
      g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.04})`;
      g.fillRect(0, y, 512, 1);
    }
    speckle(g, 512, 512, 2500);
    speckle(g, 512, 512, 800, true);
  });
}

/** Night sky through the window: deep blue, a few stars, a pale moon. */
function nightTexture() {
  return canvasTex(256, 320, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 320);
    grd.addColorStop(0, "#101a33");
    grd.addColorStop(1, "#2c4569");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 320);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,245,220,${0.3 + Math.random() * 0.5})`;
      g.fillRect(Math.random() * 256, Math.random() * 200, 1.5, 1.5);
    }
    g.fillStyle = "#f3e7c4";
    g.beginPath();
    g.arc(180, 70, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a2a48";
    g.fillRect(0, 250, 256, 70); // a hedge line
    g.fillStyle = "#16233c";
    for (let x = 0; x < 256; x += 22) {
      g.beginPath();
      g.arc(x + 11, 252, 16, Math.PI, 0);
      g.fill();
    }
  });
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
  current: Pose; // the pose the director asked for
  shown: string; // the picture on screen right now (a pose or one of its replacement frames)
  seat: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  turn: SCurve; // the body turn in progress
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
  private baseFov = 56;
  private fov = 56;
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
  private lastStep = 0;
  private step = 0;
  private lamp: THREE.SpotLight | null = null;
  private composer: EffectComposer | null = null;
  private bokeh: CutoutBokehPass | null = null;
  private lampBase = 1;
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
      this.bokeh = new CutoutBokehPass(this.scene, this.camera, { focus: 1.2, aperture: 0.004, maxblur: 0.007 });
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
    sc.background = new THREE.Color("#21160e");
    sc.fog = new THREE.Fog("#21160e", 3.4, 8);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    sc.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = 0.18;

    const circ = 2 * Math.PI * ROOM_R;
    const paper = new THREE.Mesh(
      new THREE.CylinderGeometry(ROOM_R, ROOM_R, WALL_H - WAINSCOT_H, 96, 1, true),
      new THREE.MeshStandardMaterial({ map: wallpaperTexture([circ / 0.32, (WALL_H - WAINSCOT_H) / 0.32]), roughness: 0.95, side: THREE.BackSide }),
    );
    paper.position.y = WAINSCOT_H + (WALL_H - WAINSCOT_H) / 2;
    paper.receiveShadow = true;
    const boards = new THREE.Mesh(
      new THREE.CylinderGeometry(ROOM_R, ROOM_R, WAINSCOT_H, 96, 1, true),
      new THREE.MeshStandardMaterial({ map: wainscotTexture([circ / 0.5, 1]), roughness: 0.7, side: THREE.BackSide }),
    );
    boards.position.y = WAINSCOT_H / 2;
    const rail = new THREE.Mesh(new THREE.TorusGeometry(ROOM_R - 0.012, 0.014, 6, 128), new THREE.MeshStandardMaterial({ color: "#3a2416", roughness: 0.6 }));
    rail.rotation.x = Math.PI / 2;
    rail.position.y = WAINSCOT_H;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R, 96), new THREE.MeshStandardMaterial({ map: floorTexture([3, 3]), roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const ceiling = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R, 64), new THREE.MeshStandardMaterial({ color: "#3b2a1c", roughness: 1 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_H;
    sc.add(paper, boards, rail, floor, ceiling);

    // a window onto the night, behind the far left of the table
    const win = new THREE.Group();
    const a = Math.PI + 0.42;
    win.position.set(Math.sin(a) * (ROOM_R - 0.03), 0.98, Math.cos(a) * (ROOM_R - 0.03));
    win.lookAt(0, 0.98, 0);
    const cream = new THREE.MeshStandardMaterial({ color: "#e6d6b4", roughness: 0.6 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.84, 0.04), cream);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.74), new THREE.MeshBasicMaterial({ map: nightTexture(), fog: false }));
    glass.position.z = 0.021;
    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.74, 0.03), cream);
    const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.03), cream);
    mullionV.position.z = mullionH.position.z = 0.03;
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.035, 0.1), cream);
    sill.position.set(0, -0.43, 0.04);
    win.add(frame, glass, mullionV, mullionH, sill);
    sc.add(win);
    const moon = new THREE.DirectionalLight("#8fa8e8", 0.55);
    moon.position.copy(win.position).setY(1.3);
    sc.add(moon);

    // pendant lamp over the table: the key light, warm, pooling on the tabletop
    const lampY = 1.05;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, WALL_H - lampY, 6), new THREE.MeshStandardMaterial({ color: "#1d140e" }));
    cord.position.y = lampY + (WALL_H - lampY) / 2;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.13, 40, 1, true), new THREE.MeshStandardMaterial({ color: "#2e4a3b", roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }));
    shade.position.y = lampY;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.165, 0.125, 40, 1, true), new THREE.MeshBasicMaterial({ color: "#f6dfa8", side: THREE.BackSide }));
    inner.position.y = lampY - 0.002;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff3d0" }));
    bulb.position.y = lampY - 0.05;
    sc.add(cord, shade, inner, bulb);
    const lamp = new THREE.SpotLight("#ffcb85", 4.4, 0, 0.98, 0.85, 1.6);
    lamp.position.set(0, lampY - 0.06, 0);
    lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.0006;
    lamp.shadow.radius = 4;
    sc.add(lamp, lamp.target);
    this.lamp = lamp;
    this.lampBase = lamp.intensity;
    // soft fill from behind the viewer, and the room's bounce light
    const fill = new THREE.DirectionalLight("#ffdcb4", 0.6);
    fill.position.set(0.5, 1.3, 2.6);
    sc.add(fill);
    sc.add(new THREE.HemisphereLight("#ffd9a6", "#3b2618", 0.28));
  }

  private buildTable() {
    this.table.clear();
    const { rTable } = this.ring;
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62, metalness: 0 });
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
    const rug = new THREE.Mesh(new THREE.CircleGeometry(this.ring.rSeat + 0.42, 96), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.004;
    rug.receiveShadow = true;
    this.table.add(top, leg, foot, rug);
  }

  private resize() {
    const w = this.root.clientWidth || 360;
    const h = this.root.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    // portrait phones get a taller view so the speaker fits; landscape sees most of the table at once
    this.baseFov = w / h >= 1 ? 56 : 58;
    this.shot(this.focus, this.shotCamera, true); // a new frame size cuts straight to the shot
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
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
      shown: "",
      seat: seat.clone(),
      yaw: 0,
      targetYaw: 0,
      turn: new SCurve(0),
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
      materials: [],
      k: null,
    };
    f.yaw = f.targetYaw = this.yawTo(seat, CENTER);
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

  private addKey(f: Figure, key: string, o: THREE.Object3D) {
    const old = f.poses.get(key);
    if (old) {
      f.tilt.remove(old);
      f.cards.delete(old);
      f.materials = f.materials.filter(({ m }) => {
        let keep = true;
        old.traverse((x: any) => x.material === m && (keep = false));
        return keep;
      });
    }
    o.visible = false;
    o.position.y = -PIVOT_Y;
    f.tilt.add(o);
    f.poses.set(key, o);
    if (o.userData.card) f.cards.add(o);
    o.traverse((x: any) => {
      if (x.isMesh && x.material && "color" in x.material) f.materials.push({ m: x.material, base: x.material.color.clone() });
    });
    f.shown = "";
  }

  private async loadInto(f: Figure, key: string) {
    const o = await this.loadKey(f, key);
    if (o && !this.disposed && this.figures.get(f.member.id) === f) this.addKey(f, key, o);
  }

  private async reloadFigure(f: Figure) {
    for (const o of f.poses.values()) f.tilt.remove(o);
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

  /** Put one picture on screen: a replacement frame if this figure has it, else the pose it belongs to. */
  private showFrame(f: Figure, name: string) {
    let shown = f.poses.has(name) ? name : "";
    if (!shown) {
      const base = name === "talk_a" || name === "talk_b" || name === "blink" ? "neutral" : name === "wake" ? "away" : name.replace(/_b$/, "");
      shown = this.resolvePose(f, base as Pose);
    }
    if (shown === f.shown) return;
    f.shown = shown;
    for (const [p, o] of f.poses) o.visible = p === shown;
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
    const now = performance.now();
    if (now - this.lastStep < 1000 / FPS - 4) return; // hold the picture: stop motion
    this.lastStep = now;
    const s = ++this.step;
    const dt = 1 / FPS;
    this.sampleMove(now);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.look);
    // set lights drift a hair between exposures
    if (this.lamp) this.lamp.intensity = this.lampBase * (1 + (Math.random() - 0.5) * 0.035);
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const v = new THREE.Vector3();
    const { rSeat, rTable } = this.ring;
    for (const f of this.figures.values()) {
      // body turns on an S curve; a quarter turn takes about half a second
      let dy = f.targetYaw - f.turn.p1;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
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
      // flat cut-outs always face the viewer (a mesh turns for real)
      if (f.cards.size) {
        const toCam = this.yawTo(f.seat, this.camPos) - f.yaw;
        for (const o of f.cards) o.rotation.y = toCam;
      }
      f.dim += (f.targetDim - f.dim) * 0.4;
      // asleep: pulled in to the table, slumped over its edge
      f.group.position.copy(f.seat).multiplyScalar(1 - (0.08 * f.dim * rTable) / rSeat);
      for (const { m, base } of f.materials) m.color.copy(base).multiplyScalar(1 - 0.3 * f.dim);
      this.showFrame(f, this.pickFrame(f));
      // name card on the table edge in front of the seat
      v.copy(f.seat).multiplyScalar((rTable - 0.05) / rSeat).setY(TABLE_Y + 0.01).project(this.camera);
      const onScreen = v.z < 1 && v.x > -1.1 && v.x < 1.1;
      f.label.style.left = `${((v.x + 1) / 2) * w}px`;
      f.label.style.top = `${((1 - v.y) / 2) * h}px`;
      f.label.classList.toggle("away", asleep);
      f.label.style.opacity = onScreen ? "1" : "0";
    }
    if (this.composer && this.bokeh) {
      // focus on whatever the viewer is looking at (the speaker, or the far side of the table)
      (this.bokeh.uniforms as any).focus.value = this.camera.position.distanceTo(this.look);
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
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
  private shot(f: Figure | null, camera: Camera, snap = false) {
    this.focus = f;
    this.shotCamera = camera;
    const portrait = this.portrait();
    const rest = new THREE.Vector3(0, portrait ? 0.5 : 0.44, -this.ring.rSeat * 0.6);
    if (!f && this.figures.size === 1) {
      // one person across the table (the figure preview): look at them, closer
      const only = [...this.figures.values()][0];
      this.aim(new THREE.Vector3(only.seat.x, 0.48, only.seat.z), this.baseFov * 0.62, snap);
    } else if (!f) {
      this.aim(rest, this.baseFov, snap);
    } else {
      const face = new THREE.Vector3(f.seat.x, portrait ? 0.54 : 0.5, f.seat.z);
      this.aim(rest.clone().lerp(face, portrait ? 1 : 0.75), this.baseFov * (camera === "close" ? 0.7 : 1), snap);
    }
  }

  /**
   * Move the camera to a new shot the way a motion-control rig does: an S curve that eases out of rest and
   * into the new framing. A move that interrupts another keeps its speed, so the camera never stops dead mid-pan.
   */
  private aim(target: THREE.Vector3, fov: number, snap = false) {
    const m = this.move;
    if (!snap && m.p1.distanceTo(target) < 1e-4 && Math.abs(m.f1 - fov) < 0.01) return; // already on its way there
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
    // longer pans and bigger zooms take longer: about 0.8 s to a neighbour, 1.3 s across the whole table
    const angle = this.look.clone().sub(this.camPos).angleTo(target.clone().sub(this.camPos));
    m.dur = (Math.min(1.3, 0.6 + 0.7 * angle + 0.6 * Math.abs(Math.log(fov / this.fov))) * 1000) / (this.current?.speed ?? 1);
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
    (window as any).__sceneLog ??= [];
    (window as any).__sceneLog.push({ t: Date.now(), id: item.messageId, member: item.memberId, status: item.status });
    // null when the viewer is the one talking: there is no figure, everyone looks at the camera
    const f = item.memberId === this.viewerId ? null : this.figures.get(item.memberId) ?? null;
    const others = [...this.figures.values()].filter((x) => x !== f);
    if (f) {
      if (f.current === "away") this.stir(f);
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
        if (o.current === "away" && r.pose !== "away") this.stir(o);
        o.targetDim = 0;
        this.showPose(o, r.pose);
      } else {
        if (!o.member.present && o.current !== "away") this.stir(o);
        this.showPose(o, o.member.present ? "neutral" : "away");
      }
      if (!r && !o.member.present) o.targetDim = 1;
      const look = r?.look ?? (awake ? "speaker" : "down");
      o.targetYaw =
        look === "camera" || (look === "speaker" && !f) ? this.yawTo(o.seat, this.camPos) : look === "speaker" && f ? this.yawTo(o.seat, f.seat) : this.yawTo(o.seat, CENTER);
      o.gesture = "none";
    }
    this.shot(f, item.camera);
    this.showCaption(item);

    const dur = itemDuration(item) / speed;
    // turn to the speaker: the line starts as the camera slows into the new shot
    const settling = this.move.t0 + this.move.dur * 0.8 - performance.now();
    await new Promise((r) => setTimeout(r, Math.max(380 / speed, settling)));
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
    this.composer?.dispose();
    this.renderer.dispose();
    this.root.remove();
  }
}

export function createStage(container: HTMLElement, opts: StageOptions): Stage {
  return new Stage(container, opts);
}
