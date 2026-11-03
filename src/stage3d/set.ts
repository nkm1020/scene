// The miniature set. Its surfaces are photographs made by Muse Image in the same clay look as the figures
// (scripts/make-set.ts): four walls shot straight on, the floor and the tabletop from above. Geometry only holds them up:
// a square room, a round table with a turned edge and pedestal. The props on the table are cut-outs like the figures
// (the stage places them). Lighting stays soft so the photographs' own light carries the look.
import * as THREE from "three";

export const HALF = 1.9; // the room is a square, 3.8 across
export const WALL_H = 1.9; // each wall photograph is 2:1
const SET = "/set";

/** Where a set picture lives: served from /set, or embedded (data URLs) in an exported replay page. */
export function setUrl(name: string): string {
  return (globalThis as any).__SCENE_SET__?.[name] ?? `${SET}/${name}.webp`;
}

const loader = new THREE.TextureLoader();
function tex(name: string) {
  const t = loader.load(setUrl(name));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let clayNormal: THREE.Texture | null = null;
/** Thumb-pressed relief as a tileable normal map, for the few surfaces that are geometry (the table's edge and foot). */
function clayNormalMap(): THREE.Texture {
  if (clayNormal) return clayNormal;
  const N = 128;
  const hgt = new Float32Array(N * N);
  for (let k = 0; k < 60; k++) {
    const cx = Math.random() * N, cy = Math.random() * N, r = 4 + Math.random() * 12, d = (Math.random() - 0.35) * 1.2;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const q = (x * x + y * y) / (r * r);
        if (q > 1) continue;
        const yy = ((((cy + y) | 0) % N) + N) % N, xx = ((((cx + x) | 0) % N) + N) % N;
        hgt[yy * N + xx] += d * (1 - q) * (1 - q);
      }
  }
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const img = g.createImageData(N, N);
  const h = (x: number, y: number) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 2.2, dy = (h(x, y + 1) - h(x, y - 1)) * 2.2, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  clayNormal = new THREE.CanvasTexture(c);
  clayNormal.wrapS = clayNormal.wrapT = THREE.RepeatWrapping;
  clayNormal.repeat.set(4, 1);
  return clayNormal;
}

const lathe = (pts: [number, number][], seg = 64) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

export interface SetLights {
  lamp: THREE.SpotLight;
  /** practical lights that waver a little between exposures (the candles) */
  flicker: { light: THREE.Light; base: number; amount: number }[];
}

export function buildRoom(sc: THREE.Scene): SetLights {
  sc.background = new THREE.Color("#1a120c");
  sc.fog = new THREE.Fog("#1a120c", 3.6, 8);

  // four walls, each one Muse Image photograph, unlit so its own warm studio light is what you see
  const walls: [string, THREE.Vector3, number][] = [
    ["wall-front", new THREE.Vector3(0, WALL_H / 2, -HALF), 0],
    ["wall-left", new THREE.Vector3(-HALF, WALL_H / 2, 0), Math.PI / 2],
    ["wall-right", new THREE.Vector3(HALF, WALL_H / 2, 0), -Math.PI / 2],
    ["wall-back", new THREE.Vector3(0, WALL_H / 2, HALF), Math.PI],
  ];
  for (const [name, at, ry] of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, WALL_H), new THREE.MeshBasicMaterial({ map: tex(name), color: "#cdbfae" }));
    m.position.copy(at);
    m.rotation.y = ry;
    sc.add(m);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshStandardMaterial({ map: tex("floor"), roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshBasicMaterial({ color: "#20160f" }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H;
  sc.add(floor, ceiling);

  // a warm pool of light over the table (the pendant itself is off-frame), soft fill everywhere else
  const lamp = new THREE.SpotLight("#ffd7a0", 3.2, 0, 0.9, 0.9, 1.4);
  lamp.position.set(0, 1.25, 0.1);
  lamp.target.position.set(0, 0, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  lamp.shadow.radius = 6;
  sc.add(lamp, lamp.target);
  const fill = new THREE.DirectionalLight("#fff0dc", 0.55);
  fill.position.set(0.4, 1.4, 2.4);
  sc.add(fill);
  sc.add(new THREE.HemisphereLight("#fff1dc", "#5a3f2a", 0.75));
  return { lamp, flicker: [] };
}

/** The table: a Muse Image tabletop on a turned walnut edge and pedestal; candle light over the cake. */
export function buildTable(rTable: number, tableY: number) {
  const g = new THREE.Group();
  const walnut = new THREE.MeshStandardMaterial({ color: "#5b3520", roughness: 0.75, normalMap: clayNormalMap(), normalScale: new THREE.Vector2(0.5, 0.5) });
  const top = new THREE.Mesh(new THREE.CircleGeometry(rTable, 96), new THREE.MeshStandardMaterial({ map: tex("tabletop"), roughness: 0.8 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = tableY;
  top.receiveShadow = true;
  const edge = new THREE.Mesh(lathe([[rTable, tableY], [rTable + 0.006, tableY - 0.012], [rTable - 0.002, tableY - 0.032], [rTable - 0.05, tableY - 0.04], [0, tableY - 0.04]], 96), walnut);
  edge.castShadow = edge.receiveShadow = true;
  const ped = new THREE.Mesh(lathe([[0, 0.01], [0.19, 0.01], [0.2, 0.03], [0.08, 0.055], [0.05, 0.1], [0.07, 0.15], [0.045, 0.2], [0.04, tableY - 0.1], [0.07, tableY - 0.06], [0.08, tableY - 0.04], [0, tableY - 0.04]], 40), walnut);
  ped.castShadow = true;
  g.add(top, edge, ped);
  const candles = new THREE.PointLight("#ffb062", 0.55, 1.1, 1.6);
  candles.position.set(0, tableY + 0.2, -0.02);
  g.add(candles);
  return { group: g, flicker: [{ light: candles as THREE.Light, base: candles.intensity, amount: 0.25 }] };
}
