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
        <div className="wordmark">Scene</div>
        <h1>Your group chat, performed.</h1>
        <p className="lede">
          Your friends stand on the table as little clay figures. Each one says what they typed, in their own voice, and nothing else. Missed the chat? Press play and
          the table acts it out.
        </p>
        <div className="home-actions">
          <button className="primary" onClick={() => go(true)} disabled={!!busy}>
            {busy === "demo" ? "Opening…" : "Open the demo room"}
          </button>
          <button className="ghost" onClick={() => go(false)} disabled={!!busy}>
            {busy === "new" ? "Creating…" : "Start a room"}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
        <ul className="how">
          <li>
            <b>Sculpted by Meta models</b>
            Three words. Muse Image sculpts a clay you and six expressions, SAM 3.1 cuts each one out, SAM 3D turns them into figures.
          </li>
          <li>
            <b>Directed by Muse Spark</b>
            Spark reads the whole conversation and directs the table: who speaks how, who laughs, who wakes up when their name comes up. It cannot change a word.
          </li>
          <li>
            <b>Checked by Muse Voice Transcribe</b>
            It turns what you say into the message, and listens to every line your figure speaks before it plays.
          </li>
        </ul>
        <p className="fine">No login. Demo rooms are private copies. Voices: Qwen3-TTS, self-hosted.</p>
      </div>
    </main>
  );
}
