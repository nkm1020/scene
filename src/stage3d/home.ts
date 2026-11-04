// The home screen: your figure alone on a turned walnut plinth in the middle of your room. Drag to walk the lens round
// it, pinch or scroll to come closer. The figure is a stop-motion puppet with a turnaround sheet (front, three-quarter,
// side, three-quarter back, back, the rest mirrored), each view a Muse Image edit cut out by SAM 3.1, swapped as the
// lens passes, the way an animator turns a puppet on the stand between exposures.
import * as THREE from "three";
import { buildRoom, applyRoomSet, type RoomSetRef } from "./set";
import { loadCut, makeCard, type FigureAssets } from "./engine";

const FIG_H = 0.8;
const PLINTH_Y = 0.12;
const FPS = 12;
// every 45 degrees of the lens, from the front round toward +x: which view, and whether it is mirrored
const VIEWS: [string, boolean][] = [
  ["neutral", false],
  ["q3", true],
  ["side", true],
  ["q3_back", true],
  ["back", false],
  ["q3_back", false],
  ["side", false],
  ["q3", false],
];
const FALLBACK: Record<string, string[]> = { q3: ["neutral"], side: ["q3", "neutral"], q3_back: ["side", "q3", "neutral"], back: ["q3_back", "side", "neutral"], blink: ["neutral"] };

export interface HomeStage {
  setFigure(figure: FigureAssets | null): void;
  setRoom(set: RoomSetRef): void;
  setBottomInset(px: number): void;
  spin(): void;
  destroy(): void;
}

export function createHomeStage(host: HTMLElement, opts: { figure: FigureAssets | null; set?: RoomSetRef }): HomeStage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "home-canvas";
  renderer.domElement.style.touchAction = "none";
  host.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 30);
  let scene = new THREE.Scene();

  // the plinth: a turned walnut stand with a soft shadow pool
  const walnut = new THREE.MeshStandardMaterial({ color: "#5b3520", roughness: 0.7 });
  const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 64);
  const plinth = new THREE.Mesh(lathe([[0, 0], [0.34, 0], [0.35, 0.02], [0.31, 0.05], [0.3, 0.09], [0.33, 0.105], [0.33, PLINTH_Y], [0, PLINTH_Y]]), walnut);
  plinth.castShadow = plinth.receiveShadow = true;
  const puppet = new THREE.Group(); // the figure's views, stood on the plinth
  puppet.position.y = PLINTH_Y;

  const build = (set: RoomSetRef) => {
    applyRoomSet(set);
    scene = new THREE.Scene();
    buildRoom(scene);
    scene.add(plinth, puppet);
  };
  build(opts.set);

  // the lens: azimuth round the plinth, a little elevation, a distance you pinch
  const DIST = 1.6; // the lens stays inside the room (walls at 1.9)
  let az = 0, el = 0.16, dist = DIST, inset = 0;
  let vAz = 0;
  let intro: { t0: number; from: number } | null = { t0: performance.now() + 500, from: 0 };
  const target = new THREE.Vector3(0, PLINTH_Y + FIG_H * 0.56, 0);

  // views: one card per key, made at the neutral pose's scale so every view lines up
  const cards = new Map<string, THREE.Object3D>();
  let figure: FigureAssets | null = null;
  let token = 0;
  const urlOf = (key: string) => figure?.[key]?.img ?? null;
  async function setFigure(f: FigureAssets | null) {
    const my = ++token;
    figure = f;
    for (const c of cards.values()) puppet.remove(c);
    cards.clear();
    const neutral = urlOf("neutral");
    if (!neutral) return;
    const base = await loadCut(neutral).catch(() => null);
    if (!base || my !== token) return;
    const k = FIG_H / Math.max(1, base.bottom - base.top);
    await Promise.all(
      ["neutral", "q3", "side", "q3_back", "back", "blink"].map(async (key) => {
        const url = urlOf(key);
        if (!url) return;
        const cut = await loadCut(url).catch(() => null);
        if (!cut || my !== token) return;
        const card = makeCard(cut, k, 0.06);
        card.visible = false;
        cards.set(key, card);
        puppet.add(card);
      }),
    );
  }
  void setFigure(opts.figure);
  const pick = (key: string): THREE.Object3D | null => {
    if (cards.has(key)) return cards.get(key)!;
    for (const k of FALLBACK[key] ?? []) if (cards.has(k)) return cards.get(k)!;
    return null;
  };

  // input: one finger turns, two fingers (or the wheel) bring the lens closer
  const pts = new Map<number, { x: number; y: number }>();
  let pinch0 = 0, dist0 = dist;
  const el0 = renderer.domElement;
  const down = (e: PointerEvent) => {
    el0.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    intro = null;
    vAz = 0;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      dist0 = dist;
    }
  };
  const move = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const d = -dx * 0.009;
      az += d;
      vAz = d;
      el = THREE.MathUtils.clamp(el + dy * 0.004, -0.05, 0.6);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) dist = THREE.MathUtils.clamp((dist0 * pinch0) / Math.max(1, d), 0.7, 1.75);
    }
  };
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = 0;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    intro = null;
    dist = THREE.MathUtils.clamp(dist * (1 + e.deltaY * 0.0012), 0.7, 1.75);
  };
  el0.addEventListener("pointerdown", down);
  el0.addEventListener("pointermove", move);
  el0.addEventListener("pointerup", up);
  el0.addEventListener("pointercancel", up);
  el0.addEventListener("wheel", wheel, { passive: false });

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + "px";
    renderer.domElement.style.height = h + "px";
    // the sheet covers the bottom: frame the figure in the part that is left, a little over half its height
    const full = (h + inset) / h;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(((FIG_H / 0.5) * full) / (2 * DIST)));
    camera.aspect = w / (h + inset);
    camera.setViewOffset(w, h + inset, 0, inset, w, h);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let raf = 0, lastFrame = 0, view = -1, blinkAt = performance.now() + 2500, blinkUntil = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (intro && now > intro.t0) {
      const t = Math.min(1, (now - intro.t0) / 4200);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      az = intro.from - e * Math.PI * 2;
      if (t >= 1) intro = null;
    } else if (!pts.size && Math.abs(vAz) > 1e-4) {
      az += vAz;
      vAz *= 0.92;
    }
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(target);

    // the puppet changes on twos: a new picture twelve times a second
    if (now - lastFrame >= 1000 / FPS) {
      lastFrame = now;
      const a = ((az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      view = Math.round(a / (Math.PI / 4)) % 8;
      let [key, mirror] = VIEWS[view];
      if (key === "neutral" && now > blinkAt) {
        key = "blink";
        if (!blinkUntil) blinkUntil = now + 130;
        if (now > blinkUntil) (blinkAt = now + 2500 + Math.random() * 3500), (blinkUntil = 0);
      }
      const show = pick(key);
      for (const c of cards.values()) c.visible = c === show;
      if (show) {
        show.scale.x = mirror ? -1 : 1;
        // clay boil: the puppet never sits perfectly still between exposures
        show.rotation.z = (Math.random() - 0.5) * 0.008;
        show.position.x = (Math.random() - 0.5) * 0.002;
      }
    }
    puppet.rotation.y = az; // the card turns to the lens; the picture on it says which way the puppet faces
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    setFigure: (f) => void setFigure(f),
    setRoom: (set) => build(set),
    setBottomInset(px) {
      inset = Math.max(0, Math.round(px));
      resize();
    },
    spin() {
      intro = { t0: performance.now(), from: az };
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el0.removeEventListener("pointerdown", down);
      el0.removeEventListener("pointermove", move);
      el0.removeEventListener("pointerup", up);
      el0.removeEventListener("pointercancel", up);
      el0.removeEventListener("wheel", wheel);
      renderer.dispose();
      el0.remove();
    },
  };
}
