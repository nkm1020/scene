"use client";
import { useState } from "react";
import HeroStage from "@/client/HeroStage";

export default function Home() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const go = async (demo: boolean) => {
    setBusy(demo ? "demo" : "new");
    setErr("");
    try {
      const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(demo ? { demo: true } : { name: "Our room" }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      location.href = `/r/${j.roomId}`;
    } catch (e: any) {
      setErr(e.message);
      setBusy(null);
    }
  };
  return (
    <main className="home">
      <div className="home-hero">
        <HeroStage />
      </div>
      <div className="home-inner">
        <div className="eyebrow">Scene</div>
        <h1>
          Text bubbles are a layout for screens.
          <br />
          <span>Glasses don&apos;t have one.</span>
        </h1>
        <p className="lede">
          Scene is the next layout for chat. Your friends sit around a table as holograms and speak their messages in their own voices — exactly what they typed,
          nothing else. Missed the group chat? Press play and the room performs it.
        </p>
        <div className="home-actions">
          <button className="primary" onClick={() => go(true)} disabled={!!busy}>
            {busy === "demo" ? "Opening…" : "Open the demo room"}
          </button>
          <button className="ghost" onClick={() => go(false)} disabled={!!busy}>
            {busy === "new" ? "Creating…" : "Start a new room"}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
        <ul className="how">
          <li>
            <b>Muse Voice Transcribe</b> turns what you say into the message, checks your voice enrollment, and reads back every synthesized line before it plays.
          </li>
          <li>
            <b>Muse Spark 1.3</b> directs missed conversations — emotion, gesture, camera, timing — and can&apos;t change a word: its output has no text field.
          </li>
          <li>
            <b>Muse Image + SAM 3.1</b> draw your stylized persona and cut it out for the hologram.
          </li>
        </ul>
        <p className="fine">No login. Demo rooms are private copies. Voice synthesis: Qwen3-TTS (Apache 2.0), self-hosted.</p>
      </div>
    </main>
  );
}
