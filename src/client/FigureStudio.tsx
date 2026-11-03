"use client";
// Your figure, made and dressed. First Muse Image sculpts a face and a look from three picks; then you change hair,
// top and extras the way an avatar builder works: every option is drawn on your own figure, and your face stays
// exactly as it is (SAM 3.1 found it once; code pastes it back on every change). "Done" makes the expressions.
import { useEffect, useRef, useState } from "react";
import { createStage, type FigureAssets } from "@/stage3d/engine";
import { api, type Creds } from "./api";
import { Recorder } from "./audio";
import { Icon } from "./ui";

const HAIR = ["short messy black hair", "long wavy brown hair", "curly red hair", "blond bob", "silver buzz cut", "pink ponytail"];
const OUTFIT = ["green hoodie", "denim jacket", "yellow cardigan", "black turtleneck", "striped tee", "red varsity jacket"];
const VIBE = ["cheerful", "calm", "playful", "smug", "sleepy", "bold"];

type Part = "hair" | "outfit" | "extra" | "say";
const TABS: { part: Part; label: string }[] = [
  { part: "hair", label: "Hair" },
  { part: "outfit", label: "Top" },
  { part: "extra", label: "Extras" },
  { part: "say", label: "Say it" },
];
type Tile = { id: string; label: string; tile?: string; error?: string };

function FigurePreview({ figure, name }: { figure: FigureAssets; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const st = createStage(host.current, { members: [{ id: "me", name, figure, present: true }], viewerId: null, quiet: true, showMark: false });
    return () => st.destroy();
  }, [figure, name]);
  return <div className="figure-preview" ref={host} />;
}

/** Read an NDJSON stream line by line. */
async function readLines(res: Response, onLine: (o: any) => void) {
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({ error: `HTTP ${res.status}` }))).error);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onLine(JSON.parse(line));
    }
  }
}

export default function FigureStudio({ creds, neutral, onDone, compact }: { creds: Creds; neutral?: string | null; onDone: () => void; compact?: boolean }) {
  const [figure, setFigure] = useState<string | null>(neutral ?? null);
  const [phase, setPhase] = useState<"describe" | "dress">(neutral ? "dress" : "describe");
  const [hair, setHair] = useState(HAIR[0]);
  const [outfit, setOutfit] = useState(OUTFIT[0]);
  const [vibe, setVibe] = useState(VIBE[0]);
  const [tab, setTab] = useState<Part>("hair");
  const [tiles, setTiles] = useState<Record<string, Tile[]>>({});
  const [loading, setLoading] = useState<Part | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [spent, setSpent] = useState(0);

  const make = async () => {
    setBusy("Muse Image is sculpting your figure");
    setErr("");
    try {
      const r = await api<{ neutral: { img: string }; usd: number }>("/api/figure", { method: "POST", json: { ...creds, hair, outfit, vibe } });
      setFigure(r.neutral.img);
      setSpent((s) => s + r.usd);
      setTiles({});
      setPhase("dress");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  const load = async (part: Exclude<Part, "say">) => {
    setLoading(part);
    setErr("");
    const list: Tile[] = [];
    setTiles((t) => ({ ...t, [part]: [] }));
    try {
      const res = await fetch("/api/figure/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...creds, part }) });
      await readLines(res, (o) => {
        if (o.done) return setSpent((s) => s + (o.usd ?? 0));
        list.push(o);
        setTiles((t) => ({ ...t, [part]: [...list] }));
      });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(null);
    }
  };

  // open a tab: draw its six options on the figure as it is now
  useEffect(() => {
    if (phase !== "dress" || tab === "say" || tiles[tab] || loading) return;
    void load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tab]);

  const wear = async (t: Tile) => {
    if (!t.tile) return;
    setPicked(t.id);
    setBusy("Putting it on");
    setErr("");
    try {
      const r = await api<{ neutral: { img: string } }>("/api/figure/pick", { method: "POST", json: { ...creds, id: t.id } });
      setFigure(r.neutral.img);
      // the other parts were drawn on the old look: draw them again when opened
      setTiles((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k === tab)));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  const finish = async () => {
    setBusy("Starting your expressions");
    try {
      await api("/api/figure/done", { method: "POST", json: creds });
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  if (phase === "describe")
    return (
      <div className="studio">
        {!compact && <h1>Your figure</h1>}
        <p className="muted">Pick three things and Muse Image sculpts a clay you. You can change hair, top and extras after; your face stays the same.</p>
        <Pick label="Hair" options={HAIR} value={hair} set={setHair} busy={!!busy} />
        <Pick label="Top" options={OUTFIT} value={outfit} set={setOutfit} busy={!!busy} />
        <Pick label="Mood" options={VIBE} value={vibe} set={setVibe} busy={!!busy} />
        {busy && <p className="pulse muted">{busy}…</p>}
        {err && <p className="err">{err}</p>}
        <div className="row">
          {!compact && (
            <button className="text-btn" onClick={onDone} disabled={!!busy}>
              Skip
            </button>
          )}
          <button className="primary" onClick={make} disabled={!!busy}>
            {busy ? "Sculpting…" : "Make my figure"}
          </button>
        </div>
      </div>
    );

  const list = tab === "say" ? tiles.say ?? [] : tiles[tab] ?? [];
  const waiting = tab !== "say" && loading === tab ? Math.max(0, 6 - list.length) : 0;
  return (
    <div className="studio">
      {!compact && <h1>Dress your figure</h1>}
      {figure && <FigurePreview figure={{ neutral: { img: figure, glb: null } }} name="You" />}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.part} role="tab" aria-selected={tab === t.part} className={tab === t.part ? "on" : ""} onClick={() => setTab(t.part)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "say" ? (
        <SayIt creds={creds} disabled={!!busy} onTile={(t, usd) => (setTiles((p) => ({ ...p, say: [t] })), setSpent((s) => s + usd))} />
      ) : null}
      <div className="tiles">
        {list.map((t) => (
          <button key={t.id} className={`tile ${picked === t.id ? "on" : ""}`} disabled={!t.tile || !!busy} onClick={() => void wear(t)}>
            {t.tile ? <img src={t.tile} alt="" /> : <span className="tile-blank">Couldn&apos;t draw this one</span>}
            <span className="tile-label">{t.label}</span>
          </button>
        ))}
        {Array.from({ length: waiting }, (_, i) => (
          <div key={`w${i}`} className="tile wait" aria-hidden="true">
            <span className="tile-blank" />
            <span className="tile-label">&nbsp;</span>
          </div>
        ))}
      </div>
      <p className="fine">
        {loading ? "Muse Image is drawing six options on your figure. " : ""}
        Your face is kept pixel for pixel: SAM 3.1 found it once, and it is pasted back onto every change.
        {spent > 0 && <span className="num"> Spent ${spent.toFixed(3)} so far.</span>}
      </p>
      {busy && <p className="pulse muted">{busy}…</p>}
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button className="text-btn" onClick={() => setPhase("describe")} disabled={!!busy}>
          New face
        </button>
        <button className="primary" onClick={finish} disabled={!!busy}>
          Done
        </button>
      </div>
    </div>
  );
}

function Pick({ label, options, value, set, busy }: { label: string; options: string[]; value: string; set: (v: string) => void; busy: boolean }) {
  return (
    <>
      <label>{label}</label>
      <div className="chips">
        {options.map((o) => (
          <button key={o} className={`chip ${value === o ? "on" : ""}`} onClick={() => set(o)} disabled={busy}>
            {o}
          </button>
        ))}
      </div>
    </>
  );
}

/** "Say it": type or hold to talk; Voice Transcribe writes it down, Spark turns it into one change. */
function SayIt({ creds, disabled, onTile }: { creds: Creds; disabled: boolean; onTile: (t: Tile, usd: number) => void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState("");
  const [rec, setRec] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const go = async (words: string) => {
    if (!words.trim()) return;
    setState("Spark is reading it, then Muse Image draws it");
    try {
      const r = await api<{ id: string; label: string; tile: string; usd: number }>("/api/figure/say", { method: "POST", json: { ...creds, text: words } });
      onTile({ id: r.id, label: r.label, tile: r.tile }, r.usd);
      setState("");
    } catch (e: any) {
      setState(e.message);
    }
  };
  return (
    <form
      className="say"
      onSubmit={(e) => {
        e.preventDefault();
        void go(text);
      }}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="a red beanie, curly green hair…" maxLength={120} disabled={disabled} />
      <button
        type="button"
        className={`icon-btn ${rec ? "live" : ""}`}
        aria-label="Hold to say it"
        disabled={disabled}
        onPointerDown={async () => {
          try {
            recorder.current ??= new Recorder();
            await recorder.current.start();
            setRec(true);
          } catch {
            setState("Microphone blocked: type it instead");
          }
        }}
        onPointerUp={async () => {
          if (!rec || !recorder.current) return;
          setRec(false);
          setState("Muse Voice Transcribe…");
          const { wav } = await recorder.current.stop();
          const fd = new FormData();
          fd.append("memberId", creds.memberId);
          fd.append("secret", creds.secret);
          fd.append("audio", wav, "say.wav");
          try {
            const r = await api<{ text: string }>("/api/transcribe", { method: "POST", body: fd });
            setText(r.text);
            void go(r.text);
          } catch (e: any) {
            setState(e.message);
          }
        }}
      >
        <Icon name="mic" />
      </button>
      <button type="submit" className="ghost" disabled={disabled || !text.trim()}>
        Make it
      </button>
      {state && <p className="fine say-state">{state}</p>}
    </form>
  );
}
