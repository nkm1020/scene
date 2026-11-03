"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStage, type Stage, type PerformItem, type StageMember, type FigureAssets } from "@/stage3d/engine";
import { ruleDirection } from "@/core/rules";
import { browserDb } from "./supabase";
import { api, loadCreds, saveCreds, lastSeen, setLastSeen, type Creds } from "./api";
import { Recorder } from "./audio";
import { ENROLL_SENTENCES } from "@/core/seed";
import { castHere } from "@/core/cast";
import { Icon, Mark } from "./ui";
import FigureStudio from "./FigureStudio";

type Member = { id: string; room_id: string; name: string; persona_url: string | null; persona_away_url?: string | null; figure?: FigureAssets | null; figure_status?: string | null; enrolled_voice: boolean; preset: string; is_seed: boolean };
type Message = { id: string; room_id: string; member_id: string; seq: number; text: string; created_at: string };
type Render = {
  message_id: string;
  status: "pending" | "verified" | "captions_only" | "silent";
  audio_url: string | null;
  duration_ms: number | null;
  envelope: number[] | null;
  flags: string[];
  emotion: any;
  gesture: any;
  camera: any;
  pause_ms: number;
  direction_source: string;
  similarity: number | null;
  heard: string | null;
  reactions?: { member_id: string; pose: any; look: any }[] | null;
};
type RoomState = { room: { id: string; name: string; is_demo: boolean }; members: Member[]; messages: Message[]; renders: Render[] };


function toItem(m: Message, r: Render | undefined, roster?: { member_id: string; name: string; present: boolean }[]): PerformItem {
  // Reactions: the director's (Spark) when stored, else the rule table with live presence.
  const reactions = (r?.reactions ?? (roster ? ruleDirection({ id: m.id, sender_id: m.member_id, text: m.text }, roster).reactions : []) ?? []).map((x) => ({
    memberId: x.member_id,
    pose: x.pose,
    look: x.look,
  }));
  return {
    reactions,
    messageId: m.id,
    memberId: m.member_id,
    text: m.text,
    emotion: r?.emotion ?? "neutral",
    gesture: r?.gesture ?? "none",
    camera: r?.camera ?? "room",
    pauseMs: r?.pause_ms ?? 300,
    audioUrl: r?.audio_url ?? null,
    envelope: r?.envelope ?? [],
    durationMs: r?.duration_ms ?? 0,
    status: r?.status === "pending" || !r ? "captions_only" : r.status,
    flags: r?.flags ?? [],
  };
}

export default function RoomApp({ roomId }: { roomId: string }) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [joined, setJoined] = useState(false);
  const [connected, setPresent] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState(0);
  const [mode, setMode] = useState<"idle" | "directing" | "replaying">("idle");
  const [directorNote, setDirectorNote] = useState<string>("");
  const [settings, setSettings] = useState(false);
  const [friends, setFriends] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const stageHost = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const liveQueue = useRef<PerformItem[]>([]);
  const earlyRenders = useRef(new Map<string, Render>()); // renders that arrived before their message
  const [liveSeen, setLiveSeen] = useState<Set<string>>(new Set()); // performed live while you were here
  const busy = useRef(false);
  const stateRef = useRef<RoomState | null>(null);
  stateRef.current = state;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const me = useMemo(() => state?.members.find((m) => m.id === creds?.memberId) ?? null, [state, creds]);
  // who is at the table: connected members, plus the demo cast that the story puts there
  const present = useMemo(() => new Set([...connected, ...(state?.members ?? []).filter(castHere).map((m) => m.id)]), [connected, state?.members]);
  const presentRef = useRef(present);
  presentRef.current = present;
  const roster = () => (stateRef.current?.members ?? []).map((m) => ({ member_id: m.id, name: m.name, present: presentRef.current.has(m.id) }));

  const reload = useCallback(async () => {
    const s = await api<RoomState>(`/api/rooms/${roomId}`);
    setState(s);
    return s;
  }, [roomId]);

  useEffect(() => {
    const c = loadCreds(roomId);
    setCreds(c);
    setJoined(!!c);
    setSeen(lastSeen(roomId));
    reload().catch((e) => setError(e.message));
  }, [roomId, reload]);

  // Stage
  const stageMembers: StageMember[] = useMemo(
    () => (state?.members ?? []).map((m) => ({ id: m.id, name: m.name, personaUrl: m.persona_url, awayUrl: m.persona_away_url ?? null, figure: m.figure ?? null, present: present.has(m.id) })),
    [state?.members, present],
  );
  useEffect(() => {
    if (!joined || !stageHost.current || !state) return;
    if (!stage.current) stage.current = createStage(stageHost.current, { members: stageMembers, viewerId: creds?.memberId ?? null });
    else stage.current.setMembers(stageMembers);
  }, [joined, stageMembers, state, creds?.memberId]);
  useEffect(
    () => () => {
      stage.current?.destroy();
      stage.current = null;
    },
    [],
  );

  // Live performance queue (messages that arrive while you're here)
  const pump = useCallback(async () => {
    console.debug("[rt] pump", { busy: busy.current, mode: modeRef.current, stage: !!stage.current, q: liveQueue.current.length });
    if (busy.current || modeRef.current !== "idle" || !stage.current) return;
    const item = liveQueue.current.shift();
    if (!item) return;
    busy.current = true;
    try {
      const ctl = stage.current.play([{ ...item, pauseMs: 150 }], {});
      await ctl.done;
      setLiveSeen((prev) => new Set(prev).add(item.messageId));
    } finally {
      busy.current = false;
      void pump();
    }
  }, [roomId]);

  // Realtime: messages, renders, members, presence
  useEffect(() => {
    if (!joined || !creds) return;
    const sb = browserDb();
    const ch = sb
      .channel(`room:${roomId}`, { config: { presence: { key: creds.memberId } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` }, (p) => {
        const m = p.new as Message;
        console.debug("[rt] message", m.id, m.member_id === creds.memberId ? "mine" : "theirs");
        if (stateRef.current && !stateRef.current.messages.some((x) => x.id === m.id)) stateRef.current = { ...stateRef.current, messages: [...stateRef.current.messages, m] };
        setState((s) => (s && !s.messages.some((x) => x.id === m.id) ? { ...s, messages: [...s.messages, m] } : s));
        const early = earlyRenders.current.get(m.id);
        if (early) {
          earlyRenders.current.delete(m.id);
          if (modeRef.current === "idle") {
            liveQueue.current.push(toItem(m, early, roster()));
            void pump();
          }
        } else if (m.member_id !== creds.memberId) stage.current?.setWaiting(m.member_id, true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "renders", filter: `room_id=eq.${roomId}` }, (p) => {
        const r = p.new as Render;
        console.debug("[rt] render", p.eventType, r?.message_id, r?.status, (p.old as any)?.status);
        if (!r?.message_id) return;
        setState((s) => (s ? { ...s, renders: [...s.renders.filter((x) => x.message_id !== r.message_id), r] } : s));
        if (r.status === "pending") return;
        if (p.eventType === "UPDATE" && (p.old as any)?.status && (p.old as any).status !== "pending") return; // direction-only update
        const msg = stateRef.current?.messages.find((m) => m.id === r.message_id);
        if (!msg) {
          console.debug("[rt] early render stored", r.message_id);
          earlyRenders.current.set(r.message_id, r);
          return;
        }
        if (modeRef.current !== "idle") return; // replay will cover it
        // Your own line plays too, in the small mirror: you hear what your friends hear.
        stage.current?.setWaiting(msg.member_id, false);
        liveQueue.current.push(toItem(msg, r, roster()));
        void pump();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `room_id=eq.${roomId}` }, () => {
        void reload();
      })
      .on("presence", { event: "sync" }, () => {
        const ids = new Set(Object.keys(ch.presenceState()));
        setPresent(ids);
      })
      .subscribe((status, err) => {
        console.debug("[rt] channel", status, err?.message ?? "");
        if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
      });
    return () => {
      void sb.removeChannel(ch);
    };
  }, [joined, creds, roomId, reload, pump]);

  // Presence → stage posture
  useEffect(() => {
    for (const m of state?.members ?? []) stage.current?.setPresence(m.id, present.has(m.id));
  }, [present, state?.members]);

  // missed = what was said before you opened the room; anything after that is performed live as it arrives
  const openSeq = useRef<number | null>(null);
  if (state && openSeq.current === null) openSeq.current = state.messages.at(-1)?.seq ?? 0;
  const missed = useMemo(
    () => (state?.messages ?? []).filter((m) => m.seq > seen && m.seq <= (openSeq.current ?? 0) && m.member_id !== creds?.memberId && !liveSeen.has(m.id)),
    [state, seen, creds, liveSeen],
  );

  const playMissed = async () => {
    if (!stage.current || !state) return;
    stage.current.unlockAudio();
    const segment = state.messages.filter((m) => m.seq > seen);
    if (!segment.length) return;
    setMode("directing");
    setDirectorNote(`Muse Spark is directing ${Math.min(segment.length, 40)} lines…`);
    try {
      const res = await api(`/api/rooms/${roomId}/replay`, { method: "POST", json: { afterSeq: seen, present: [...present] } });
      const last = res.log?.at(-1);
      setDirectorNote(
        res.source === "spark"
          ? `Spark directed · validator ✓${res.log.length > 1 ? ` (try ${res.log.length})` : ""}${last ? ` · ${(last.ms / 1000).toFixed(1)} s` : ""}`
          : `Rule-table fallback (${(res.flags ?? []).join(", ")})`,
      );
      const s = await reload();
      const byId = new Map(s.renders.map((r) => [r.message_id, r]));
      const items = s.messages.filter((m) => m.seq > seen).slice(-40).map((m) => toItem(m, byId.get(m.id), roster()));
      setMode("replaying");
      const ctl = stage.current.play(items, { speed, onItem: (i) => setProgress({ i: i + 1, n: items.length }) });
      (window as any).__sceneCtl = ctl;
      await ctl.done;
      const maxSeq = Math.max(...s.messages.map((m) => m.seq));
      setLastSeen(roomId, maxSeq);
      setSeen(maxSeq);
    } catch (e: any) {
      setDirectorNote(`Replay failed: ${e.message}`);
    } finally {
      setMode("idle");
      setProgress(null);
      void pump();
    }
  };

  // iOS/Safari: unlock audio on the first touch anywhere, so live lines can play later without a tap.
  useEffect(() => {
    if (!joined) return;
    const unlock = () => {
      stage.current?.unlockAudio();
      try {
        const a = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
        void a.play().catch(() => void 0);
      } catch {}
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, [joined]);

  if (error) return <div className="center-msg">Couldn&apos;t open this room: {error}</div>;
  if (!state) return <div className="center-msg">Opening the room…</div>;
  if (!joined || !creds)
    return (
      <Join
        roomId={roomId}
        roomName={state.room.name}
        onDone={(c) => {
          saveCreds(roomId, c);
          setCreds(c);
          setJoined(true);
          void reload();
        }}
      />
    );

  return (
    <div className="room">
      <header className="room-top">
        <div className="room-id">
          <Mark label={false} />
          <div>
            <div className="room-name">{state.room.name}</div>
            <div className="room-sub num">
              {state.members.length} at the table · {present.size} here
            </div>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setFriends(true)} aria-label="Add a friend" title="Add a friend">
            <Icon name="addFriend" />
          </button>
          <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Your figure, voice and receipt" title="Your figure, voice and receipt">
            <Icon name="sliders" />
          </button>
        </div>
      </header>
      <div className="stage-host" ref={stageHost}>
        {mode === "idle" && missed.length > 0 && (
          <button className="missed-pill" onClick={playMissed}>
            <Icon name="play" />
            <span>
              <b>{missed.length}</b> missed · Play
            </span>
          </button>
        )}
        {mode === "directing" && <div className="director-note pulse">{directorNote}</div>}
        {mode === "replaying" && (
          <div className="replay-ctl">
            <span className="director-note">
              {progress ? `${progress.i}/${progress.n} · ` : ""}
              {directorNote}
            </span>
            <button
              className="ghost small"
              onClick={() => {
                const s = speed === 1 ? 1.25 : 1;
                setSpeed(s);
                (window as any).__sceneCtl?.setSpeed(s);
              }}
            >
              {speed === 1 ? "1×" : "1.25×"}
            </button>
            <button className="ghost small" onClick={() => (window as any).__sceneCtl?.skip()}>
              Skip
            </button>
          </div>
        )}
        {mode === "idle" && missed.length === 0 && directorNote && <div className="director-note fade">{directorNote}</div>}
        {state.members.length <= 1 && (
          <div className="empty-room">
            <p>You sit here, at the camera. Seat a friend and they appear across the table.</p>
            <button className="primary" onClick={() => setFriends(true)}>
              Add a friend
            </button>
          </div>
        )}
      </div>
      <Composer creds={creds} me={me} onSent={() => void 0} disabled={mode !== "idle"} />
      {friends && <FriendsSheet roomId={roomId} creds={creds} members={state.members} onClose={() => setFriends(false)} onAdded={() => void reload()} />}
      {settings && <Settings roomId={roomId} creds={creds} me={me} onClose={() => setSettings(false)} onChanged={() => void reload()} />}
    </div>
  );
}

// ───────────────────────────── Add a friend: demo friends (played by Spark) or an invite link ─────────────────────────────

type DemoFriend = { id: string; name: string; persona: string };
const SEED_FACE: Record<string, string> = { sam: "/seed/figures/sam/neutral.webp", mina: "/seed/figures/mina/neutral.webp", jay: "/seed/figures/jay/neutral.webp" };

function FriendsSheet({ roomId, creds, members, onClose, onAdded }: { roomId: string; creds: Creds; members: Member[]; onClose: () => void; onAdded: () => void }) {
  const [list, setList] = useState<DemoFriend[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api<{ friends: DemoFriend[] }>(`/api/rooms/${roomId}/friends`).then((r) => setList(r.friends), (e) => setErr(e.message));
  }, [roomId]);
  const seat = async (id: string) => {
    setBusy(id);
    setErr("");
    try {
      await api(`/api/rooms/${roomId}/friends`, { method: "POST", json: { ...creds, friend: id } });
      onAdded();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
  const link = typeof location === "undefined" ? "" : location.href;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add a friend">
        <div className="sheet-head">
          Add a friend
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <section>
          <h3>Invite someone</h3>
          <p className="sub">They open the link, make their figure, and sit down at your table.</p>
          <div className="invite-row">
            <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
            <button
              className="ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>
        <section>
          <h3>Demo friends</h3>
          <p className="sub">For trying Scene alone. Muse Spark plays them and they answer when you post, in their own voices.</p>
          <div className="friend-list">
            {list.map((f) => {
              const here = members.some((m) => m.name === f.name);
              return (
                <div className="friend-row" key={f.id}>
                  <div className="face">{SEED_FACE[f.id] && <img src={SEED_FACE[f.id]} alt="" />}</div>
                  <div className="who">
                    <b>{f.name}</b>
                    <span>{f.persona.split(". ")[0]}.</span>
                  </div>
                  {here ? (
                    <span className="here">At the table</span>
                  ) : (
                    <button className="ghost small" disabled={!!busy} onClick={() => void seat(f.id)}>
                      {busy === f.id ? "Seating…" : "Seat"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {err && <p className="err">{err}</p>}
        </section>
      </div>
    </div>
  );
}

// ───────────────────────────── Composer: hold to talk / type ─────────────────────────────

function Composer({ creds, me, disabled }: { creds: Creds; me: Member | null; onSent: () => void; disabled: boolean }) {
  const rec = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = async (t: string) => {
    const body = t.trim();
    if (!body) return;
    setStatus("Sending…");
    try {
      await api("/api/messages", { method: "POST", json: { ...creds, text: body } });
      setStatus(me?.enrolled_voice ? "Sent · they'll hear it in your voice" : "Sent · preset voice (register yours in ⚙︎)");
      setText("");
    } catch (e: any) {
      setStatus(e.message);
    }
    setTimeout(() => setStatus(""), 3500);
  };

  const startRec = async () => {
    if (disabled) return;
    try {
      rec.current ??= new Recorder();
      await rec.current.start();
      setRecording(true);
      setStatus("Listening…");
    } catch {
      setStatus("Microphone blocked — type instead");
      setTyping(true);
    }
  };
  const stopRec = async () => {
    if (!recording || !rec.current) return;
    setRecording(false);
    setStatus("Muse Voice Transcribe…");
    try {
      const { wav, durationMs } = await rec.current.stop();
      if (durationMs < 400) return setStatus("Hold the button while you talk");
      const fd = new FormData();
      fd.append("memberId", creds.memberId);
      fd.append("secret", creds.secret);
      fd.append("audio", wav, "talk.wav");
      const r = await api<{ text: string }>("/api/transcribe", { method: "POST", body: fd });
      if (!r.text) return setStatus("Didn't catch that");
      setStatus("");
      setPreview(r.text);
      setEditing(false);
      timer.current = setTimeout(() => {
        setPreview(null);
        void send(r.text);
      }, 1500);
    } catch (e: any) {
      setStatus(e.message);
    }
  };

  // Desktop: hold Space to talk (ignored while typing in a field).
  const startRef = useRef(startRec);
  const stopRef = useRef(stopRec);
  startRef.current = startRec;
  stopRef.current = stopRec;
  useEffect(() => {
    const typingTarget = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typingTarget(e)) return;
      e.preventDefault();
      void startRef.current();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typingTarget(e)) return;
      e.preventDefault();
      void stopRef.current();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return (
    <div className="composer">
      {preview !== null && (
        <div className="preview">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = preview;
                setPreview(null);
                void send(t);
              }}
            >
              <input autoFocus value={preview} onChange={(e) => setPreview(e.target.value)} maxLength={280} />
              <button type="submit">Send</button>
            </form>
          ) : (
            <button
              className="preview-text"
              onClick={() => {
                if (timer.current) clearTimeout(timer.current);
                setEditing(true);
              }}
            >
              “{preview}” <span>tap to edit</span>
              <i className="countdown" />
            </button>
          )}
        </div>
      )}
      {status && <div className="status">{status}</div>}
      {typing ? (
        <form
          className="type-row"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" maxLength={280} autoFocus />
          <button type="submit" disabled={!text.trim()}>
            Send
          </button>
          <button type="button" className="icon-btn" onClick={() => setTyping(false)} aria-label="Hold to talk instead">
            <Icon name="mic" />
          </button>
        </form>
      ) : (
        <div className="talk-row">
          <button className="icon-btn" onClick={() => setTyping(true)} aria-label="Type instead">
            <Icon name="keyboard" />
          </button>
          <button
            className={`talk ${recording ? "on" : ""}`}
            disabled={disabled}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              void startRec();
            }}
            onPointerUp={() => void stopRec()}
            onPointerCancel={() => void stopRec()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {recording ? "Release to send" : "Hold to talk"}
            <span className="kbd-hint">or hold Space</span>
          </button>
          <div className="me-chip">{me?.persona_url ? <img src={me.persona_url} alt="" /> : <span>{me?.name?.[0] ?? "?"}</span>}</div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Join: name → persona → voice ─────────────────────────────

function Join({ roomId, roomName, onDone }: { roomId: string; roomName: string; onDone: (c: Creds) => void }) {
  const [step, setStep] = useState<"name" | "persona" | "voice">("name");
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("female_a");
  const [creds, setCreds] = useState<Creds | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ member: Member; secret: string }>(`/api/rooms/${roomId}/join`, { method: "POST", json: { name, preset } });
      const c = { memberId: r.member.id, secret: r.secret };
      saveCreds(roomId, c);
      setCreds(c);
      setStep("persona");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="join">
      <div className="join-card">
        <div className="room-tag">Scene · {roomName}</div>
        {step === "name" && (
          <>
            <h1>Take a seat.</h1>
            <p className="muted">Your friends will see you as a clay figure at their table, saying your messages in your voice.</p>
            <label>Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Sam" autoFocus />
            <label>Voice until you register yours</label>
            <div className="chips">
              {[
                ["female_a", "Preset A"],
                ["female_b", "Preset B"],
                ["male", "Preset C"],
                ["male_b", "Preset D"],
              ].map(([k, l]) => (
                <button key={k} className={`chip ${preset === k ? "on" : ""}`} onClick={() => setPreset(k)}>
                  {l}
                </button>
              ))}
            </div>
            {err && <p className="err">{err}</p>}
            <button className="primary" disabled={!name.trim() || busy} onClick={join}>
              {busy ? "…" : "Continue"}
            </button>
            <p className="fine">No account, no email. A private key for this room stays in this browser.</p>
          </>
        )}
        {step === "persona" && creds && <FigureStudio creds={creds} onDone={() => setStep("voice")} />}
        {step === "voice" && creds && <VoiceStep creds={creds} onNext={() => onDone(creds)} />}
      </div>
    </div>
  );
}

function VoiceStep({ creds, onNext, compact }: { creds: Creds; onNext: () => void; compact?: boolean }) {
  const [lang, setLang] = useState<"en" | "ko">("en");
  const rec = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [secs, setSecs] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    setErr("");
    setRes(null);
    try {
      rec.current ??= new Recorder();
      await rec.current.start();
      setRecording(true);
      setSecs(0);
      tick.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      setErr("Microphone permission is needed to register your voice.");
    }
  };
  const stop = async () => {
    if (!rec.current) return;
    if (tick.current) clearInterval(tick.current);
    setRecording(false);
    setBusy(true);
    try {
      const { wav } = await rec.current.stop();
      rec.current.release();
      rec.current = null;
      const fd = new FormData();
      fd.append("memberId", creds.memberId);
      fd.append("secret", creds.secret);
      fd.append("lang", lang);
      fd.append("audio", wav, "enroll.wav");
      setRes(await api("/api/voice", { method: "POST", body: fd }));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {!compact && <h1>Your voice</h1>}
      <p className="muted">Read these three sentences aloud. Muse Voice Transcribe checks you actually read them — that is your consent, and only your own voice can be registered.</p>
      <div className="chips">
        <button className={`chip ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")} disabled={recording || busy}>
          English
        </button>
        <button className={`chip ${lang === "ko" ? "on" : ""}`} onClick={() => setLang("ko")} disabled={recording || busy}>
          한국어
        </button>
      </div>
      <ol className="sentences">
        {ENROLL_SENTENCES[lang].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {res && (
        <div className={`check ${res.ok ? "ok" : "bad"}`}>
          {res.ok ? "✓ Registered" : "✗ Not registered"} · read-back {(res.similarity * 100).toFixed(0)}% (need 80%) · {(res.durationMs / 1000).toFixed(1)} s
          {!res.ok && <div className="fine">{res.reasons.join(" · ")}</div>}
          {res.heard && <div className="fine">heard: “{res.heard}”</div>}
        </div>
      )}
      {err && <p className="err">{err}</p>}
      <div className="row">
        {!compact && !res?.ok && (
          <button className="ghost" onClick={onNext} disabled={recording || busy}>
            Skip
          </button>
        )}
        {res?.ok ? (
          <button className="primary" onClick={onNext}>
            {compact ? "Done" : "Enter the room"}
          </button>
        ) : recording ? (
          <button className="primary rec" onClick={stop}>
            ■ Stop ({secs}s)
          </button>
        ) : (
          <button className="primary" onClick={start} disabled={busy}>
            {busy ? "Checking…" : res ? "Record again" : "● Record"}
          </button>
        )}
      </div>
    </>
  );
}

// ───────────────────────────── Settings ─────────────────────────────

function Settings({ roomId, creds, me, onClose, onChanged }: { roomId: string; creds: Creds; me: Member | null; onClose: () => void; onChanged: () => void }) {
  const [view, setView] = useState<"main" | "persona" | "voice">("main");
  const [receipt, setReceipt] = useState<any>(null);
  useEffect(() => {
    api(`/api/rooms/${roomId}/receipt`).then(setReceipt).catch(() => void 0);
  }, [roomId]);
  const del = async (what: "persona" | "voice") => {
    await api("/api/me", { method: "DELETE", json: { ...creds, what } });
    onChanged();
  };
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          {view === "main" ? "You" : view === "persona" ? "Your figure" : "Your voice"}
          <button className="icon-btn" onClick={view === "main" ? onClose : () => setView("main")} aria-label={view === "main" ? "Close" : "Back"}>
            <Icon name="close" />
          </button>
        </div>
        {view === "persona" && (
          <FigureStudio
            creds={creds}
            compact
            neutral={me?.persona_url ?? null}
            onDone={() => {
              onChanged();
              setView("main");
            }}
          />
        )}
        {view === "voice" && (
          <VoiceStep
            creds={creds}
            compact
            onNext={() => {
              onChanged();
              setView("main");
            }}
          />
        )}
        {view === "main" && (
          <>
            <section>
              <h3>Your figure</h3>
              <div className="row">
                {me?.persona_url ? <img className="thumb" src={me.persona_url} alt="" /> : <span className="muted">A plain clay figure for now</span>}
                <button className="ghost small" onClick={() => setView("persona")}>
                  {me?.persona_url ? "Dress" : "Make"}
                </button>
                {me?.persona_url && (
                  <button className="ghost small danger" onClick={() => del("persona")}>
                    Delete
                  </button>
                )}
              </div>
            </section>
            <section>
              <h3>Your voice</h3>
              <div className="row">
                <span className="muted">{me?.enrolled_voice ? "Registered (only you)" : "Preset voice"}</span>
                <button className="ghost small" onClick={() => setView("voice")}>
                  {me?.enrolled_voice ? "Re-record" : "Register"}
                </button>
                {me?.enrolled_voice && (
                  <button className="ghost small danger" onClick={() => del("voice")}>
                    Delete
                  </button>
                )}
              </div>
            </section>
            <section>
              <h3>Receipt · this room</h3>
              {receipt ? (
                <>
                  <table className="rec">
                    <tbody>
                      <tr>
                        <th>model</th>
                        <th>calls</th>
                        <th>$</th>
                      </tr>
                      {Object.entries<any>(receipt.byModel).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>{v.calls}</td>
                          <td>{v.usd.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="fine">
                    {receipt.calls} calls · ${receipt.usd.toFixed(4)} total
                    {Object.entries<any>(receipt.byOp)
                      .filter(([k]) => ["message.tts", "message.readback", "director.spark", "persona.draw"].includes(k))
                      .map(([k, v]) => ` · ${k} p50 ${(v.p50 / 1000).toFixed(1)} s`)
                      .join("")}
                  </p>
                </>
              ) : (
                <p className="muted">Loading…</p>
              )}
            </section>
            <section>
              <h3>Privacy</h3>
              <p className="fine">
                You can only register your own voice, after reading three sentences that Scene verifies. Friends who haven&apos;t registered appear as a default
                persona with a preset voice. Messages are stored as text; your spoken audio is transcribed and discarded. Your persona and voice reference are
                the only media stored, and you can delete them here. Every synthesized line is read back and checked before it plays. All Meta calls use the
                Standard tier. Every performance is marked AI-made.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
