"use client";
// The landing hero's film: the seed chat as a strip of exposures, each a still the stage rendered of that line.
// The strip runs through the gate between the two halves of the headline; scrolling the hero pulls it down a frame at a time.
import { useEffect, useRef, useState } from "react";

export const EXPOSURES = [
  { who: "Sam", line: "ok Friday 7pm. everyone hide in the kitchen", t: "0:03" },
  { who: "Mina", line: "I'll bring the cake", t: "0:02" },
  { who: "Sam", line: "DO NOT tell Jay", t: "0:02" },
  { who: "Jay", line: "tell me what", t: "0:02" },
  { who: "Mina", line: "...", t: "0:01" },
  { who: "Sam", line: "wrong chat", t: "0:01" },
  { who: "Jay", line: "this is the only chat we have", t: "0:03" },
  { who: "Mina", line: "surprise?", t: "0:01" },
  { who: "Jay", line: "I'm bringing the cake", t: "0:02" },
  { who: "Sam", line: "you can't bring your own cake", t: "0:03" },
  { who: "Jay", line: "watch me", t: "0:01" },
];
const START = 2; // the hero opens on “DO NOT tell Jay”, with the lines before it above the gate
const STEPS = 3; // frames pulled through the gate while the hero holds

const pad = (n: number) => String(n).padStart(3, "0"); // the room's frame numbers, as on the strip
const frameSrc = (i: number) => `/landing/frames/${String(i + 1).padStart(2, "0")}.webp`; // taste-skill-ignore: file names

export default function LandingReel({ onFrame }: { onFrame?: (i: number) => void }) {
  const gate = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(START);

  useEffect(() => {
    const g = gate.current, tr = track.current;
    if (!g || !tr) return;
    const pin = g.closest<HTMLElement>("[data-pin]");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = -1;
    const frames = [...tr.querySelectorAll<HTMLElement>(".reel-exp")];
    const place = () => {
      raf = 0;
      let k = START;
      const r = pin?.getBoundingClientRect();
      const run = r ? r.height - innerHeight : 0;
      if (r && run > 40 && !still) {
        const p = Math.min(1, Math.max(0, -r.top / run)) * STEPS;
        // a projector's claw: the frame holds, then is pulled down quickly
        const n = Math.floor(p), f = p - n;
        const e = f < 0.55 ? 0 : 1 - Math.pow(1 - (f - 0.55) / 0.45, 3);
        k = START + Math.min(STEPS, n + e);
      }
      const first = frames[0], pic = first.querySelector<HTMLElement>(".reel-pic")!;
      const pitch = frames[1].offsetTop - first.offsetTop;
      const y = g.clientHeight / 2 - (pic.offsetTop + pic.offsetHeight / 2) - k * pitch;
      tr.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
      frames.forEach((el, i) => el.style.setProperty("--d", Math.min(1, Math.abs(i - k)).toFixed(3)));
      const i = Math.round(k);
      if (i !== last) ((last = i), setAt(i), onFrame?.(i));
    };
    const ask = () => (raf ||= requestAnimationFrame(place));
    place();
    addEventListener("scroll", ask, { passive: true });
    addEventListener("resize", ask);
    return () => (removeEventListener("scroll", ask), removeEventListener("resize", ask), cancelAnimationFrame(raf));
  }, [onFrame]);

  return (
    <div className="reel" ref={gate} data-ui>
      <div className="reel-track" ref={track}>
        <p className="reel-head edge">Wrong chat · Sam, Mina, Jay · 12 frames · head</p>
        {EXPOSURES.map((x, i) => (
          <figure className={`reel-exp${i === at ? " lit" : ""}`} key={i}>
            <img
              className="reel-pic"
              src={frameSrc(i)}
              width={1280}
              height={720}
              alt={`${x.who} at the clay table saying “${x.line}”`}
              loading={i <= START + 2 ? "eager" : "lazy"}
              fetchPriority={i === START ? "high" : undefined}
            />
            <figcaption className="edge">
              <b>{pad(i + 1)}</b>
              <span>{x.who}</span>
              <span className="ok">Checked</span>
              <span className="t">{x.t}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
