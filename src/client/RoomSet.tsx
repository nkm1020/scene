"use client";
import { useState } from "react";
import { api, type Creds } from "./api";

// Dress a room: three ready-made sets, or say one. Muse Spark plans a said room (a checked spec, never words on the
// wall) and Muse Image paints its four walls, floor and tabletop. Everyone at the table sees it change.
export const THEMES = [
  { id: "dining", label: "Dining room", thumb: "/set/wall-front.webp" },
  { id: "cafe", label: "Corner cafe", thumb: "/set/cafe/wall-left.webp" },
  { id: "rooftop", label: "Rooftop at night", thumb: "/set/rooftop/wall-front.webp" },
];

export default function RoomSetPicker({ roomId, creds, current, onChanged }: { roomId: string; creds: Creds; current: any; onChanged: (set: any) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const on = current?.urls ? "said" : current?.theme ?? "dining";

  const pick = async (theme: string) => {
    setBusy(theme);
    setErr("");
    try {
      const r = await api(`/api/rooms/${roomId}/set`, { method: "POST", json: { ...creds, theme } });
      onChanged(r.set);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
  const say = async () => {
    if (!said.trim()) return;
    setBusy("said");
    setErr("");
    setNote("Muse Spark is planning the room, then Muse Image paints four walls, the floor and the tabletop…");
    try {
      const r = await api(`/api/rooms/${roomId}/set`, { method: "POST", json: { ...creds, said } });
      setNote(`Painted in ${(r.ms / 1000).toFixed(0)} s · $${r.usd.toFixed(3)} · plan checked${r.plan.length > 1 ? ` on try ${r.plan.length}` : ""}`);
      onChanged(r.set);
    } catch (e: any) {
      setErr(e.message);
      setNote("");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="roomset">
      <div className="tiles">
        {THEMES.map((t) => (
          <button key={t.id} className={`tile ${on === t.id ? "on" : ""}`} disabled={!!busy} onClick={() => void pick(t.id)}>
            <img src={t.thumb} alt="" />
            <span className="tile-label">{busy === t.id ? "Setting…" : t.label}</span>
          </button>
        ))}
      </div>
      {current?.urls && (
        <p className="sub">
          Now: <b>“{current.said}”</b>
        </p>
      )}
      <h3>Say a room</h3>
      <p className="sub">Any place in any language: a beach hut at sunset, 우리 동네 포장마차, a library on a rainy night.</p>
      <form
        className="say"
        onSubmit={(e) => {
          e.preventDefault();
          void say();
        }}
      >
        <input value={said} onChange={(e) => setSaid(e.target.value)} placeholder="Describe the room" maxLength={200} disabled={!!busy} />
        <button className="primary small" type="submit" disabled={!!busy || !said.trim()}>
          {busy === "said" ? "Painting…" : "Paint it"}
        </button>
      </form>
      {note && <p className="say-state edge">{note}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
