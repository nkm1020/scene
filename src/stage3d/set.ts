// The miniature set: a dining room built the way a stop-motion crew builds one, out of real pieces at puppet scale.
// Flat walls with corners, raised wainscot panels, a deep window with curtains, a sideboard with a lamp on it,
// and a laid table (a birthday cake with candles, a teapot, a place setting for everyone, yours in the foreground).
// Every surface carries a little handmade relief (a shared clay normal map) so the lamp light catches it.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { TeapotGeometry } from "three/examples/jsm/geometries/TeapotGeometry.js";

export const ROOM_R = 2.3;
export const WALL_H = 1.8;
export const WAINSCOT_H = 0.5;
const SIDES = 10;
const APOTHEM = ROOM_R * Math.cos(Math.PI / SIDES);
const WALL_W = 2 * ROOM_R * Math.sin(Math.PI / SIDES);

// ───────── textures ─────────

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number], color = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, rgb = "30,15,5", max = 0.1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rgb},${Math.random() * max})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

let clayNormal: THREE.Texture | null = null;
/** Thumb-pressed relief as a tileable normal map: soft dents of random size, the way modelling clay looks up close. */
function clayNormalMap(): THREE.Texture {
  if (clayNormal) return clayNormal;
  const N = 256;
  const hgt = new Float32Array(N * N);
  for (let k = 0; k < 140; k++) {
    const cx = Math.random() * N, cy = Math.random() * N, r = 6 + Math.random() * 22, d = (Math.random() - 0.35) * 1.2;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const q = (x * x + y * y) / (r * r);
        if (q > 1) continue;
        const xx = (((cx + x) | 0) % N + N) % N, yy = (((cy + y) | 0) % N + N) % N;
        hgt[yy * N + xx] += d * (1 - q) * (1 - q);
      }
  }
  clayNormal = canvasTex(
    N,
    N,
    (g) => {
      const img = g.createImageData(N, N);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const h = (xx: number, yy: number) => hgt[((yy + N) % N) * N + ((xx + N) % N)];
          const dx = (h(x + 1, y) - h(x - 1, y)) * 2.2, dy = (h(x, y + 1) - h(x, y - 1)) * 2.2;
          const l = Math.hypot(dx, dy, 1);
          const i = (y * N + x) * 4;
          img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
          img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
          img.data[i + 2] = (1 / l) * 255;
          img.data[i + 3] = 255;
        }
      g.putImageData(img, 0, 0);
    },
    [3, 3],
    false,
  );
  return clayNormal;
}

/** A handmade material: flat colour (or a painted map) with the clay relief pressed into it. */
function clay(color: THREE.ColorRepresentation, o: { rough?: number; map?: THREE.Texture; relief?: number; metal?: number; side?: THREE.Side } = {}) {
  const r = o.relief ?? 0.35;
  return new THREE.MeshStandardMaterial({
    color: o.map ? "#ffffff" : color,
    map: o.map ?? null,
    roughness: o.rough ?? 0.82,
    metalness: o.metal ?? 0,
    normalMap: r ? clayNormalMap() : null,
    normalScale: new THREE.Vector2(r, r),
    side: o.side ?? THREE.FrontSide,
  });
}

/** Bottle-green wallpaper with a small ochre sprig, printed a little off-register. */
function wallpaper() {
  return canvasTex(
    256,
    256,
    (g) => {
      g.fillStyle = "#2c4a3c";
      g.fillRect(0, 0, 256, 256);
      speckle(g, 256, 256, 900, "10,25,18", 0.18);
      // narrow ochre stripes with a small sprig between them, faded like old paper
      for (let x = 0; x < 256; x += 32) {
        g.fillStyle = "rgba(184,137,60,.22)";
        g.fillRect(x, 0, 3, 256);
      }
      for (let y = 0; y < 256; y += 48)
        for (let x = 16; x < 256; x += 32) {
          g.save();
          g.translate(x + (Math.random() - 0.5) * 1.5, y + ((x / 32) % 2) * 24 + 12);
          g.fillStyle = "rgba(201,160,82,.55)";
          g.beginPath();
          g.ellipse(-2.5, 0, 2, 4.5, -0.5, 0, Math.PI * 2);
          g.ellipse(2.5, 0, 2, 4.5, 0.5, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
    },
    [WALL_W / 0.26, (WALL_H - WAINSCOT_H) / 0.26],
  );
}

function floorboards() {
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = "#3f2717";
      g.fillRect(0, 0, 512, 512);
      for (let y = 0; y < 512; y += 42) {
        let x = -Math.random() * 200;
        while (x < 512) {
          const len = 170 + Math.random() * 220;
          g.fillStyle = `rgb(${70 + Math.random() * 18},${44 + Math.random() * 10},${26 + Math.random() * 6})`;
          g.fillRect(x + 1, y + 1, len - 2, 40);
          g.strokeStyle = "rgba(30,16,8,.3)";
          for (let k = 0; k < 4; k++) {
            g.beginPath();
            const yy = y + 5 + Math.random() * 32;
            g.moveTo(x, yy);
            g.bezierCurveTo(x + len / 3, yy + 3, x + (2 * len) / 3, yy - 3, x + len, yy);
            g.stroke();
          }
          x += len;
        }
        g.fillStyle = "rgba(14,7,3,.85)";
        g.fillRect(0, y, 512, 2);
      }
      speckle(g, 512, 512, 1500);
    },
    [3, 3],
  );
}

function rugTex() {
  return canvasTex(512, 512, (g) => {
    const c = 256;
    const rings: [number, string][] = [[256, "#7a2f1d"], [236, "#c08a3a"], [224, "#7a2f1d"], [170, "#3d2a1c"], [158, "#a7472a"], [96, "#c08a3a"], [84, "#7a2f1d"]];
    for (const [r, col] of rings) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#e0b867";
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      g.save();
      g.translate(c + Math.cos(a) * 197, c + Math.sin(a) * 197);
      g.rotate(a);
      g.fillRect(-6, -6, 12, 12);
      g.restore();
    }
    speckle(g, 512, 512, 4000, "255,230,190", 0.06);
  });
}

function nightTex() {
  return canvasTex(256, 320, (g) => {
    g.fillStyle = "#13203f";
    g.fillRect(0, 0, 256, 320);
    g.fillStyle = "#1d2d55";
    g.fillRect(0, 200, 256, 120);
    g.fillStyle = "#0b1328";
    g.beginPath();
    g.moveTo(0, 240);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, 226 + Math.sin(x / 30) * 12 + Math.random() * 6);
    g.lineTo(256, 320);
    g.lineTo(0, 320);
    g.fill();
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,248,220,${0.3 + Math.random() * 0.6})`;
      g.fillRect(Math.random() * 256, Math.random() * 190, 1.6, 1.6);
    }
    g.fillStyle = "#f6edc8";
    g.beginPath();
    g.arc(178, 70, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#13203f";
    g.beginPath();
    g.arc(188, 64, 18, 0, Math.PI * 2);
    g.fill();
  });
}

/** A small oil painting: a field, a hill and a tree under a wide sky, in a few strokes. */
function painting(seed: number) {
  return canvasTex(160, 120, (g) => {
    const sky = ["#9fb7c9", "#d7b38a", "#a9a3c4"][seed % 3];
    g.fillStyle = sky;
    g.fillRect(0, 0, 160, 120);
    g.fillStyle = ["#6f8b52", "#8a7a3e", "#5d7a63"][seed % 3];
    g.beginPath();
    g.moveTo(0, 80);
    g.bezierCurveTo(50, 50 + seed * 4, 100, 90, 160, 64);
    g.lineTo(160, 120);
    g.lineTo(0, 120);
    g.fill();
    g.fillStyle = "#3e5230";
    g.beginPath();
    g.arc(110 - seed * 20, 58, 14, 0, Math.PI * 2);
    g.fill();
    g.fillRect(108 - seed * 20, 60, 4, 20);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,240" : "40,30,20"},${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 160, Math.random() * 120, 3 + Math.random() * 5, 1.5);
    }
  });
}

/** Lace for the table runner: a cream disc with a scalloped, pierced edge (alpha). */
function laceTex() {
  return canvasTex(256, 256, (g) => {
    const c = 128;
    g.fillStyle = "#efe6d2";
    g.beginPath();
    for (let i = 0; i <= 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const r = 118 + Math.abs(Math.sin(a * 12)) * 9;
      i ? g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.fill();
    g.globalCompositeOperation = "destination-out";
    for (const [rr, n, s] of [[104, 36, 4], [76, 24, 3.5], [48, 14, 3]] as const)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        g.beginPath();
        g.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, s, 0, Math.PI * 2);
        g.fill();
      }
    g.globalCompositeOperation = "source-over";
  });
}

// ───────── pieces ─────────

const lathe = (pts: [number, number][], seg = 40) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadows: "both" | "receive" | "cast" | "none" = "both") {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows === "both" || shadows === "cast";
  m.receiveShadow = shadows === "both" || shadows === "receive";
  return m;
}

/** Place `o` against wall `i` (0 = straight ahead of the viewer), `x` along the wall, `y` up, `d` out from it. */
function onWall(o: THREE.Object3D, i: number, x: number, y: number, d: number) {
  const a = Math.PI + (i * 2 * Math.PI) / SIDES; // wall 0 faces the viewer across the table
  const nx = Math.sin(a), nz = Math.cos(a); // outward
  const tx = Math.cos(a), tz = -Math.sin(a); // along the wall
  o.position.set(nx * (APOTHEM - d) + tx * x, y, nz * (APOTHEM - d) + tz * x);
  o.rotation.y = a + Math.PI; // face the centre
  return o;
}

function wainscot(i: number, walnut: THREE.Material, dark: THREE.Material) {
  const g = new THREE.Group();
  g.add(onWall(mesh(new THREE.PlaneGeometry(WALL_W, WAINSCOT_H), dark, "receive"), i, 0, WAINSCOT_H / 2, 0));
  const n = 3, pw = (WALL_W - 0.12) / n - 0.06;
  for (let k = 0; k < n; k++) {
    const x = -WALL_W / 2 + 0.06 + (k + 0.5) * (pw + 0.06) + 0.03;
    g.add(onWall(mesh(new RoundedBoxGeometry(pw, 0.28, 0.025, 2, 0.008), walnut), i, x, 0.25, 0.012));
  }
  g.add(onWall(mesh(new RoundedBoxGeometry(WALL_W + 0.02, 0.04, 0.05, 2, 0.01), walnut), i, 0, WAINSCOT_H, 0.02)); // chair rail
  g.add(onWall(mesh(new THREE.BoxGeometry(WALL_W + 0.02, 0.07, 0.03), dark), i, 0, 0.035, 0.015)); // skirting
  return g;
}

function framedPicture(i: number, x: number, y: number, w: number, h: number, seed: number, wood: THREE.Material) {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(w + 0.06, h + 0.06, 0.03, 2, 0.008), wood));
  const canvas = mesh(new THREE.PlaneGeometry(w, h), clay("#fff", { map: painting(seed), rough: 0.9, relief: 0.6 }), "receive");
  canvas.position.z = 0.016;
  g.add(canvas);
  return onWall(g, i, x, y, 0.018);
}

function curtain(w: number, h: number, mat: THREE.Material) {
  const geo = new THREE.PlaneGeometry(w, h, 24, 8);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k);
    p.setZ(k, Math.sin((x / w) * Math.PI * 7) * 0.018 * (1.2 - (y / h + 0.5) * 0.4));
  }
  geo.computeVertexNormals();
  return mesh(geo, mat);
}

function windowPiece(i: number, x: number, cream: THREE.Material, velvet: THREE.Material) {
  const g = new THREE.Group();
  const W = 0.6, H = 0.74, D = 0.1;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: nightTex(), fog: false }));
  glass.position.z = 0.004;
  g.add(glass);
  // reveal: the depth of the wall around the glass
  for (const [w, h, px, py] of [[W + 0.04, 0.04, 0, H / 2], [W + 0.04, 0.04, 0, -H / 2], [0.04, H, -W / 2, 0], [0.04, H, W / 2, 0]] as const) {
    const b = mesh(new THREE.BoxGeometry(w, h, D), cream);
    b.position.set(px, py, D / 2);
    g.add(b);
  }
  const mv = mesh(new THREE.BoxGeometry(0.025, H, 0.025), cream);
  const mh = mesh(new THREE.BoxGeometry(W, 0.025, 0.025), cream);
  mv.position.z = mh.position.z = 0.016;
  g.add(mv, mh);
  const sill = mesh(new RoundedBoxGeometry(W + 0.2, 0.035, 0.12, 2, 0.01), cream);
  sill.position.set(0, -H / 2 - 0.02, D / 2 + 0.03);
  g.add(sill);
  const rod = mesh(new THREE.CylinderGeometry(0.008, 0.008, W + 0.5, 8), new THREE.MeshStandardMaterial({ color: "#8a6a32", metalness: 0.6, roughness: 0.4 }));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, H / 2 + 0.08, D + 0.04);
  g.add(rod);
  for (const s of [-1, 1]) {
    const c = curtain(0.24, H + 0.2, velvet);
    c.position.set(s * (W / 2 + 0.09), -0.04, D + 0.03);
    g.add(c);
  }
  return onWall(g, i, x, 1.0, 0.0);
}

function sideboard(i: number, walnut: THREE.Material, brass: THREE.Material) {
  const g = new THREE.Group();
  const body = mesh(new RoundedBoxGeometry(0.9, 0.42, 0.3, 3, 0.02), walnut);
  body.position.y = 0.25;
  g.add(body);
  for (const [x, y] of [[-0.22, 0.33], [0.22, 0.33], [-0.22, 0.17], [0.22, 0.17]]) {
    const d = mesh(new RoundedBoxGeometry(0.38, 0.12, 0.02, 2, 0.008), walnut);
    d.position.set(x, y, 0.15);
    const k = mesh(new THREE.SphereGeometry(0.012, 10, 8), brass);
    k.position.set(x, y, 0.17);
    g.add(d, k);
  }
  for (const x of [-0.4, 0.4]) {
    const leg = mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.05, 10), walnut);
    leg.position.set(x, 0.025, 0.1);
    g.add(leg);
  }
  // on top: a lamp, books, a plant in a pot, a jar
  const lamp = new THREE.Group();
  lamp.add(mesh(lathe([[0, 0], [0.05, 0], [0.04, 0.02], [0.015, 0.04], [0.012, 0.16]]), brass));
  const shade = mesh(lathe([[0.04, 0.24], [0.085, 0.15], [0.087, 0.148]], 32), new THREE.MeshStandardMaterial({ color: "#e9c98e", roughness: 0.9, side: THREE.DoubleSide, emissive: "#ffb35c", emissiveIntensity: 0.55 }), "none");
  lamp.add(shade);
  lamp.position.set(-0.3, 0.46, 0);
  const glow = new THREE.PointLight("#ffb86b", 0.9, 1.6, 1.8);
  glow.position.set(-0.3, 0.64, 0.05);
  g.add(lamp, glow);
  const bookCols = ["#7a2f1d", "#2f4f6a", "#b8893c", "#3d5a3a"];
  bookCols.forEach((c, k) => {
    const b = mesh(new RoundedBoxGeometry(0.035, 0.15 - k * 0.012, 0.11, 1, 0.004), clay(c, { relief: 0.5 }));
    b.position.set(0.08 + k * 0.038, 0.46 + (0.15 - k * 0.012) / 2, -0.02);
    g.add(b);
  });
  const pot = mesh(lathe([[0, 0], [0.045, 0], [0.055, 0.08], [0.06, 0.09]], 24), clay("#b5572e"));
  pot.position.set(0.32, 0.46, 0);
  g.add(pot);
  const leaf = clay("#4f7a3b", { relief: 0.6 });
  for (let k = 0; k < 9; k++) {
    const l = mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.015, 10, 8), leaf);
    l.scale.set(1, 0.7, 1);
    const a = (k / 9) * Math.PI * 2;
    l.position.set(0.32 + Math.cos(a) * 0.04, 0.58 + Math.random() * 0.06, Math.sin(a) * 0.04);
    g.add(l);
  }
  return { group: onWall(g, i, 0, 0, 0.17), glow };
}

function wallClock(i: number, x: number, walnut: THREE.Material) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 40).rotateX(Math.PI / 2), walnut));
  const face = mesh(
    new THREE.CircleGeometry(0.09, 40),
    clay("#fff", {
      map: canvasTex(128, 128, (c) => {
        c.fillStyle = "#efe4c9";
        c.fillRect(0, 0, 128, 128);
        c.fillStyle = "#2a1c12";
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          c.fillRect(64 + Math.cos(a) * 52 - 3, 64 + Math.sin(a) * 52 - 3, 6, 6);
        }
        c.lineWidth = 5;
        c.strokeStyle = "#2a1c12";
        c.beginPath();
        c.moveTo(64, 64);
        c.lineTo(64, 26);
        c.moveTo(64, 64);
        c.lineTo(92, 74);
        c.stroke();
      }),
      relief: 0.3,
    }),
    "receive",
  );
  face.position.z = 0.016;
  g.add(face);
  return onWall(g, i, x, 1.25, 0.02);
}

// ───────── the room ─────────

export interface SetLights {
  lamp: THREE.SpotLight;
  /** practical lights that waver a little between exposures (candles, the sideboard lamp) */
  flicker: { light: THREE.Light; base: number; amount: number }[];
}

export function buildRoom(sc: THREE.Scene): SetLights {
  sc.background = new THREE.Color("#140d08");
  sc.fog = new THREE.Fog("#140d08", 3.2, 7.5);
  const walnut = clay("#5a3420", { rough: 0.6, relief: 0.4 });
  const dark = clay("#3a2214", { rough: 0.7, relief: 0.3 });
  const cream = clay("#e2d2ae", { rough: 0.7, relief: 0.3 });
  const brass = new THREE.MeshStandardMaterial({ color: "#a8823f", metalness: 0.7, roughness: 0.35 });
  const velvet = clay("#7b2a22", { rough: 1, relief: 0.5, side: THREE.DoubleSide });
  const paper = clay("#fff", { map: wallpaper(), rough: 0.95, relief: 0.25 });

  for (let i = 0; i < SIDES; i++) {
    const wall = onWall(mesh(new THREE.PlaneGeometry(WALL_W, WALL_H - WAINSCOT_H), paper, "receive"), i, 0, WAINSCOT_H + (WALL_H - WAINSCOT_H) / 2, 0);
    sc.add(wall, wainscot(i, walnut, dark));
  }
  const floor = mesh(new THREE.CircleGeometry(ROOM_R + 0.2, 10), clay("#fff", { map: floorboards(), rough: 0.75, relief: 0.2 }), "receive");
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = Math.PI / SIDES;
  const ceiling = mesh(new THREE.CircleGeometry(ROOM_R + 0.2, 10), clay("#2a1d14"), "none");
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H;
  sc.add(floor, ceiling);

  // dressing: the window over the left shoulder of the table, a sideboard to the right, pictures and a clock
  sc.add(windowPiece(9, 0, cream, velvet));
  const sb = sideboard(1, walnut, brass);
  sc.add(sb.group);
  sc.add(framedPicture(0, -0.35, 1.05, 0.32, 0.24, 0, walnut), framedPicture(0, 0.3, 1.12, 0.22, 0.3, 1, walnut));
  sc.add(framedPicture(1, 0.05, 1.0, 0.36, 0.26, 2, walnut));
  sc.add(wallClock(8, 0.1, walnut));
  sc.add(framedPicture(2, 0, 1.05, 0.28, 0.22, 1, walnut), framedPicture(7, 0, 1.0, 0.3, 0.24, 2, walnut));

  // the pendant lamp over the table: the key light, warm, pooling on the cloth
  const lampY = 1.08;
  const cord = mesh(new THREE.CylinderGeometry(0.004, 0.004, WALL_H - lampY, 6), new THREE.MeshStandardMaterial({ color: "#1d140e" }), "none");
  cord.position.y = lampY + (WALL_H - lampY) / 2;
  const shade = mesh(lathe([[0.02, 0.1], [0.05, 0.08], [0.1, 0.03], [0.17, -0.04], [0.175, -0.05]], 48), new THREE.MeshStandardMaterial({ color: "#2e4a3b", roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }), "none");
  shade.position.y = lampY;
  const inner = mesh(lathe([[0.018, 0.098], [0.048, 0.078], [0.098, 0.028], [0.168, -0.042]], 48), new THREE.MeshBasicMaterial({ color: "#f6dfa8", side: THREE.BackSide }), "none");
  inner.position.y = lampY - 0.002;
  const bulb = mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff3d0" }), "none");
  bulb.position.y = lampY - 0.03;
  sc.add(cord, shade, inner, bulb);
  const lamp = new THREE.SpotLight("#ffc983", 5.2, 0, 0.95, 0.75, 1.5);
  lamp.position.set(0, lampY - 0.05, 0);
  lamp.target.position.set(0, 0, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  lamp.shadow.radius = 5;
  sc.add(lamp, lamp.target);

  // moonlight through the window: a cool edge on everyone's left side
  const moon = new THREE.DirectionalLight("#8aa6ea", 0.5);
  moon.position.copy(onWall(new THREE.Object3D(), 9, 0, 1.4, 0).position);
  sc.add(moon);
  const fill = new THREE.DirectionalLight("#ffd9b0", 0.32);
  fill.position.set(0.4, 1.3, 2.6);
  sc.add(fill);
  sc.add(new THREE.HemisphereLight("#ffd9a6", "#2a1c12", 0.22));
  return { lamp, flicker: [{ light: sb.glow, base: sb.glow.intensity, amount: 0.05 }] };
}

// ───────── the laid table ─────────

/** The table and what is on it: a cake with lit candles in the middle, a teapot, and a place laid at every seat. */
export function buildTable(rTable: number, rSeat: number, seats: THREE.Vector3[], viewer: THREE.Vector3, tableY: number) {
  const g = new THREE.Group();
  const flicker: SetLights["flicker"] = [];
  const walnut = clay("#6b3f24", { rough: 0.5, relief: 0.25 });
  const china = new THREE.MeshStandardMaterial({ color: "#f1ece0", roughness: 0.32, normalMap: clayNormalMap(), normalScale: new THREE.Vector2(0.15, 0.15) });
  const glazeTeal = new THREE.MeshStandardMaterial({ color: "#2f6f6a", roughness: 0.28, normalMap: clayNormalMap(), normalScale: new THREE.Vector2(0.15, 0.15) });
  const steel = new THREE.MeshStandardMaterial({ color: "#c9c4b8", metalness: 0.8, roughness: 0.3 });

  // turned walnut top with a rounded lip, a spindle pedestal and a foot
  const top = mesh(lathe([[0, tableY], [rTable - 0.02, tableY], [rTable, tableY - 0.008], [rTable + 0.004, tableY - 0.02], [rTable - 0.004, tableY - 0.034], [rTable - 0.05, tableY - 0.04], [0, tableY - 0.04]], 96), walnut);
  const ped = mesh(lathe([[0, 0.02], [0.2, 0.02], [0.21, 0.035], [0.08, 0.06], [0.05, 0.1], [0.07, 0.15], [0.045, 0.2], [0.04, tableY - 0.1], [0.07, tableY - 0.06], [0.08, tableY - 0.04], [0, tableY - 0.04]], 40), walnut);
  const rug = mesh(new THREE.CircleGeometry(rSeat + 0.42, 96), clay("#fff", { map: rugTex(), rough: 1, relief: 0.6 }), "receive");
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.004;
  g.add(top, ped, rug);

  // lace runner and the birthday cake on a stand, candles lit
  const lace = mesh(new THREE.CircleGeometry(Math.min(0.17, rTable * 0.4), 64), new THREE.MeshStandardMaterial({ map: laceTex(), transparent: true, alphaTest: 0.5, roughness: 1 }), "receive");
  lace.rotation.x = -Math.PI / 2;
  lace.position.y = tableY + 0.002;
  g.add(lace);
  const cake = new THREE.Group();
  cake.add(mesh(lathe([[0, 0], [0.05, 0], [0.025, 0.012], [0.02, 0.05], [0.1, 0.055], [0.105, 0.062], [0, 0.062]], 48), china));
  const sponge = clay("#f3d8c4", { relief: 0.5 });
  const icing = clay("#e88aa0", { relief: 0.7, rough: 0.6 });
  cake.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 48), sponge).translateY(0.094));
  cake.add(mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.018, 48), icing).translateY(0.13));
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const drip = mesh(new THREE.CapsuleGeometry(0.008, 0.02 + (k % 3) * 0.008, 4, 8), icing);
    drip.position.set(Math.cos(a) * 0.087, 0.112 - (k % 3) * 0.004, Math.sin(a) * 0.087);
    cake.add(drip);
  }
  const flame = new THREE.MeshBasicMaterial({ color: "#ffc35a" });
  const core = new THREE.MeshBasicMaterial({ color: "#fff6d8" });
  const waxes = ["#e9798f", "#7fb3d8", "#f2c94c", "#8fcf9a", "#f0a35e"].map((c) => clay(c, { relief: 0.2, rough: 0.6 }));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const c = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.055, 8), waxes[k]);
    c.position.set(Math.cos(a) * 0.045, 0.166, Math.sin(a) * 0.045);
    const f = mesh(new THREE.SphereGeometry(0.009, 10, 8), flame, "none");
    f.scale.set(1, 1.9, 1);
    f.position.set(Math.cos(a) * 0.045, 0.207, Math.sin(a) * 0.045);
    const fc = mesh(new THREE.SphereGeometry(0.0045, 8, 6), core, "none");
    fc.scale.set(1, 1.7, 1);
    fc.position.copy(f.position).setY(0.203);
    cake.add(c, f, fc);
  }
  const candleLight = new THREE.PointLight("#ffaa55", 0.7, 1.1, 1.6);
  candleLight.position.y = 0.26;
  cake.add(candleLight);
  flicker.push({ light: candleLight, base: candleLight.intensity, amount: 0.22 });
  cake.position.y = tableY;
  cake.scale.setScalar(0.6); // puppet scale: a cake about a head wide
  g.add(cake);

  // a teapot and a sugar bowl beside the cake
  const pot = mesh(new TeapotGeometry(0.028, 8, true, true, true, false, true), glazeTeal);
  pot.position.set(-0.13, tableY + 0.028, 0.06);
  pot.rotation.y = 0.8;
  const sugar = mesh(lathe([[0, 0], [0.018, 0], [0.024, 0.018], [0.021, 0.03], [0, 0.03]], 24), china);
  sugar.position.set(0.12, tableY, 0.08);
  g.add(pot, sugar);

  // a place at every seat, the viewer's included (the nearest thing in shot, softly out of focus)
  // puppet-scale china: a plate about the width of a figure's hand span
  const k = 0.62;
  const plateGeo = lathe([[0, 0], [0.05 * k, 0], [0.058 * k, 0.004 * k], [0.066 * k, 0.01 * k], [0.068 * k, 0.012 * k]], 40);
  const cupGeo = lathe([[0, 0], [0.018 * k, 0], [0.024 * k, 0.03 * k], [0.025 * k, 0.036 * k], [0.022 * k, 0.036 * k], [0.02 * k, 0.006 * k], [0, 0.006 * k]], 24);
  const saucerGeo = lathe([[0, 0], [0.034 * k, 0.002 * k], [0.04 * k, 0.007 * k]], 24);
  const handleGeo = new THREE.TorusGeometry(0.009 * k, 0.0025 * k, 6, 12, Math.PI * 1.3);
  for (const s of [...seats, viewer]) {
    const d = new THREE.Vector3(s.x, 0, s.z).normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x);
    const at = d.clone().multiplyScalar(rTable - 0.075).setY(tableY + 0.002);
    const plate = mesh(plateGeo, china);
    plate.position.copy(at);
    const fork = mesh(new THREE.BoxGeometry(0.004, 0.0015, 0.045), steel);
    fork.position.copy(at).addScaledVector(side, -0.056);
    fork.rotation.y = Math.atan2(d.x, d.z);
    const cupAt = at.clone().addScaledVector(side, 0.062).addScaledVector(d, -0.026);
    const saucer = mesh(saucerGeo, china);
    saucer.position.copy(cupAt);
    const cup = mesh(cupGeo, china);
    cup.position.copy(cupAt).setY(tableY + 0.009 * k);
    const handle = mesh(handleGeo, china);
    handle.position.copy(cupAt).addScaledVector(side, 0.027 * k).setY(tableY + 0.027 * k);
    handle.rotation.y = Math.atan2(side.x, side.z) + Math.PI / 2;
    g.add(plate, fork, saucer, cup, handle);
  }
  return { group: g, flicker };
}
