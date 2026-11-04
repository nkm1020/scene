"use client";
import { useEffect, useState } from "react";

// The way into a room: a pair of clay double doors (one Muse Image picture, split down its seam). On the home screen
// they swing shut in front of you; the room opens with them shut, and they swing away into the room as it appears.
export default function Doors({ phase, onDone }: { phase: "closing" | "closed" | "opening"; onDone?: () => void }) {
  const [p, setP] = useState(phase);
  useEffect(() => setP(phase), [phase]);
  useEffect(() => {
    if (p === "closed") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => onDone?.(), reduced ? 0 : p === "closing" ? 520 : 1100);
    return () => clearTimeout(t);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`doors ${p}`} aria-hidden="true">
      <div className="glow" />
      <div className="leaf left">
        <i />
      </div>
      <div className="leaf right">
        <i />
      </div>
    </div>
  );
}
