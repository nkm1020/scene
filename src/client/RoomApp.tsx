"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStage, itemDuration, type Stage, type PerformItem, type StageMember, type FigureAssets } from "@/stage3d/engine";
import { ruleAddressee, ruleDirection } from "@/core/rules";
import { browserDb } from "./supabase";
import { api, loadCreds, saveCreds, lastSeen, setLastSeen, type Creds } from "./api";
import { Recorder } from "./audio";
import { ENROLL_SENTENCES } from "@/core/seed";
import { castHere } from "@/core/cast";
import { Icon, Mark } from "./ui";
import FigureStudio from "./FigureStudio";
import Doors from "./Doors";
import RoomSetPicker from "./RoomSet";
import { loadProfile, type Profile } from "./profile";
import { applyRoomSet, roomSetKey } from "@/stage3d/set";

type Member = { id: string; room_id: string; name: string; persona_url: string | null; persona_away_url?: string | null; figure?: FigureAssets | null; figure_status?: string | null; enrolled_voice: boolean; preset: string; is_seed: boolean; profile_id?: string | null };
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
  addressee?: string | null;
};
type RoomState = { room: { id: string; name: string; is_demo: boolean; kind?: string; set?: any }; members: Member[]; messages: Message[]; renders: Render[] };


/** Who a line is said to: the director's choice when stored, else the rule table (someone it names, or whoever spoke before). */
function addressee(m: Message, r: Render | undefined, roster: { member_id: string; name: string; present: boolean }[] | undefined, history: Message[]): string {
  if (r?.addressee) return r.addressee;
  if (!roster) return "all";
  const before = history.filter((x) => x.seq < m.seq || (x.seq === m.seq && x.id !== m.id && x.created_at < m.created_at));
  const prev = [...before].reverse().find((x) => x.member_id !== m.member_id);
  return ruleAddressee({ id: m.id, sender_id: m.member_id, text: m.text }, roster, prev ? { sender_id: prev.member_id } : null);
}

function toItem(m: Message, r: Render | undefined, roster?: { member_id: string; name: string; present: boolean }[], history: Message[] = []): PerformItem {
  // Reactions: the director's (Spark) when stored, else the rule table with live presence.
  const reactions = (r?.reactions ?? (roster ? ruleDirection({ id: m.id, sender_id: m.member_id, text: m.text }, roster).reactions : []) ?? []).map((x) => ({
    memberId: x.member_id,
    pose: x.pose,
    look: x.look,
  }));
  return {
    reactions,
    to: addressee(m, r, roster, history),
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
    frame: String(m.seq).padStart(3, "0"),
  };
}

/** One ribbon colour per person at the table, the same on their name card and their frames. */
const RIBBONS = ["#8fd18a", "#ff9a76", "#8ec5ff", "#d7a6ff", "#6fd3c6", "#f7a8c8"];
const ribbonOf = (members: { id: string }[], id: string) => RIBBONS[Math.max(0, members.findIndex((m) => m.id === id)) % RIBBONS.length];

/** Running time as the edge print shows it: 2.4 s, or 1:05 past a minute. */
function runTime(ms: number) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}
const frameNo = (seq: number) => String(seq).padStart(3, "0"); // the same number toItem prints on stage

export default function RoomApp({ roomId, door = false }: { roomId: string; door?: boolean }) {
  const [state, setState] = useState<RoomState | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [doors, setDoors] = useState<"closed" | "opening" | null>(door ? "closed" : null);
  const [roomSheet, setRoomSheet] = useState(false);
  const [scriptNote, setScriptNote] = useState(true);
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
  const [playing, setPlaying] = useState<string | null>(null); // the message on stage right now
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
    const p = loadProfile();
    setProfile(p);
    setSeen(lastSeen(roomId));
    if (door) history.replaceState(null, "", location.pathname);
    const c = loadCreds(roomId);
    if (c) {
      setCreds(c);
      setJoined(true);
      reload().catch((e) => setError(e.message));
      return;
    }
    // no seat here yet: with a profile you sit down as yourself; without one, make your figure first
    if (!p) {
      location.replace(`/home?next=${encodeURIComponent(`/r/${roomId}`)}`);
      return;
    }
    api<{ member: Member; secret: string }>(`/api/rooms/${roomId}/join`, { method: "POST", json: p })
      .then((r) => {
        const seat = { memberId: r.member.id, secret: p.secret };
        saveCreds(roomId, seat);
        setCreds(seat);
        setJoined(true);
        return reload();
      })
      .catch((e) => setError(e.message));
  }, [roomId, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stage
  const stageMembers: StageMember[] = useMemo(
    () => (state?.members ?? []).map((m) => ({ id: m.id, name: m.name, personaUrl: m.persona_url, awayUrl: m.persona_away_url ?? null, figure: m.figure ?? null, present: present.has(m.id) })),
    [state?.members, present],
  );
  const setKey = roomSetKey(state?.room.set);
  const builtSet = useRef<string | null>(null);
  useEffect(() => {
    if (!joined || !stageHost.current || !state) return;
    if (!stage.current) {
      applyRoomSet(state.room.set);
      builtSet.current = setKey;
      stage.current = createStage(stageHost.current, { members: stageMembers, viewerId: creds?.memberId ?? null });
    } else stage.current.setMembers(stageMembers);
  }, [joined, stageMembers, state, creds?.memberId]); // eslint-disable-line react-hooks/exhaustive-deps
  // the room got a new set: build the stage again around the same table
  useEffect(() => {
    if (!stage.current || !stageHost.current || !stateRef.current || builtSet.current === setKey) return;
    builtSet.current = setKey;
    stage.current.destroy();
    applyRoomSet(stateRef.current.room.set);
    stage.current = createStage(stageHost.current, { members: stageMembers, viewerId: creds?.memberId ?? null });
  }, [setKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // the doors open once the table is there to see
  useEffect(() => {
    if (doors !== "closed") return;
    if (error) return setDoors(null);
    if (!joined || !state) return;
    const t = setTimeout(() => setDoors("opening"), 450);
    return () => clearTimeout(t);
  }, [doors, joined, state, error]);
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
    setPlaying(item.messageId);
    try {
      const ctl = stage.current.play([{ ...item, pauseMs: 150 }], {});
      await ctl.done;
      setLiveSeen((prev) => new Set(prev).add(item.messageId));
    } finally {
      busy.current = false;
      setPlaying(null);
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
            liveQueue.current.push(toItem(m, early, roster(), stateRef.current?.messages));
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
        liveQueue.current.push(toItem(msg, r, roster(), stateRef.current?.messages));
        void pump();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `room_id=eq.${roomId}` }, () => {
        void reload();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, () => {
        void reload(); // renamed or a new set
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

  const renderOf = useMemo(() => new Map((state?.renders ?? []).map((r) => [r.message_id, r])), [state?.renders]);
  const missedMs = useMemo(() => missed.reduce((t, m) => t + itemDuration(toItem(m, renderOf.get(m.id))), 0), [missed, renderOf]);

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
          ? `Spark directed · checked${res.log.length > 1 ? ` on try ${res.log.length}` : ""}${last ? ` · ${(last.ms / 1000).toFixed(1)} s` : ""}`
          : `Rule table (${(res.flags ?? []).join(", ")})`,
      );
      const s = await reload();
      const byId = new Map(s.renders.map((r) => [r.message_id, r]));
      const items = s.messages.filter((m) => m.seq > seen).slice(-40).map((m) => toItem(m, byId.get(m.id), roster(), s.messages));
      setMode("replaying");
      const ctl = stage.current.play(items, {
        speed,
        onItem: (i) => {
          setProgress({ i: i + 1, n: items.length });
          setPlaying(items[i].messageId);
          setLiveSeen((prev) => new Set(prev).add(items[i].messageId)); // a missed frame develops as it plays
        },
      });
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
      setPlaying(null);
      void pump();
    }
  };

  // tap a frame on the strip: the table performs that one line again
  const replayOne = async (m: Message) => {
    if (!stage.current || !state || busy.current || modeRef.current !== "idle") return;
    stage.current.unlockAudio();
    busy.current = true;
    setPlaying(m.id);
    try {
      await stage.current.play([{ ...toItem(m, renderOf.get(m.id), roster(), state.messages), pauseMs: 150 }], {}).done;
    } finally {
      busy.current = false;
      setPlaying(null);
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
  if (!state || !joined || !creds) return <div className="room">{doors && <Doors phase="closed" />}</div>;

  const playingSeq = playing ? state.messages.find((m) => m.id === playing)?.seq ?? null : null;
  const ribbonCss = state.members.map((m) => `.room .s3-name[data-m="${m.id}"]{--rib:${ribbonOf(state.members, m.id)}}`).join("");
  const scripted = state.room.kind === "demo" || state.room.is_demo;
  const others = state.members.filter((m) => m.id !== creds.memberId);
  const title = state.room.kind === "dm" ? others.find((m) => !m.is_seed)?.name ?? state.room.name : state.room.name;
  return (
    <div className="room">
      <style>{ribbonCss}</style>
      <header className="room-top">
        <div className="room-id">
          {profile ? (
            <a className="icon-btn back" href="/home" aria-label="Back to your chats" title="Chats">
              <Icon name="back" />
            </a>
          ) : (
            <Mark label={false} />
          )}
          <div>
            <div className="room-name">{title}</div>
            <div className="room-sub edge">
              {scripted && <span className="script">Script · </span>}
              {state.members.length} at the table · {present.size} here
            </div>
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setFriends(true)} aria-label="Add a friend" title="Add a friend">
            <Icon name="addFriend" />
          </button>
          <button className="icon-btn" onClick={() => setRoomSheet(true)} aria-label="Dress this room" title="The room">
            <Icon name="room" />
          </button>
          <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Your figure, voice and receipt" title="Your figure, voice and receipt">
            <Icon name="sliders" />
          </button>
        </div>
      </header>
      {scripted && scriptNote && (
        <div className="script-note" role="note">
          <span className="edge">Demo script</span>
          <span>Pre-written lines, so you can watch the table perform. For real chats, add friends from home.</span>
          <button className="icon-btn" onClick={() => setScriptNote(false)} aria-label="Hide this note">
            <Icon name="close" />
          </button>
        </div>
      )}
      <div className="stage-host" ref={stageHost}>
        {mode === "idle" && !playing && missed.length > 0 && (
          <button className="missed-pill" onClick={playMissed}>
            <Icon name="play" />
            <span className="what">Play {missed.length} missed</span>
            <span className="edge">{runTime(missedMs)}</span>
          </button>
        )}
        {mode === "directing" && (
          <div className="slate directing" role="status">
            <span className="edge">{directorNote}</span>
          </div>
        )}
        {mode === "replaying" && (
          <div className="slate" role="status">
            <span className="edge">
              {playingSeq !== null && <b>Frame {frameNo(playingSeq)} · </b>}
              {progress ? `${progress.i}/${progress.n} · ` : ""}
              {directorNote}
            </span>
            <button
              onClick={() => {
                const s = speed === 1 ? 1.25 : 1;
                setSpeed(s);
                (window as any).__sceneCtl?.setSpeed(s);
              }}
              aria-label="Playback speed"
            >
              {speed === 1 ? "1×" : "1.25×"}
            </button>
            <button onClick={() => (window as any).__sceneCtl?.skip()}>Skip</button>
          </div>
        )}
        {mode === "idle" && missed.length === 0 && directorNote && (
          <div className="slate fade" role="status">
            <span className="edge">{directorNote}</span>
          </div>
        )}
        {state.members.length <= 1 && (
          <div className="empty-room">
            <p>You sit here, at the camera. Seat a friend and they appear across the table.</p>
            <button className="primary" onClick={() => setFriends(true)}>
              Add a friend
            </button>
          </div>
        )}
      </div>
      <FilmStrip
        messages={state.messages}
        members={state.members}
        renderOf={renderOf}
        meId={creds.memberId}
        missed={missed}
        playing={playing}
        canReplay={mode === "idle"}
        onOpenChange={(o) => stage.current?.setInset(o && window.innerWidth >= 1024 ? 472 : 0)}
        lineTo={(m) => addressee(m, renderOf.get(m.id), roster(), state.messages)}
        onReplay={(m) => void replayOne(m)}
      />
      <Composer creds={creds} me={me} ribbon={ribbonOf(state.members, creds.memberId)} onSent={() => void 0} disabled={mode !== "idle"} />
      {friends && <FriendsSheet roomId={roomId} creds={creds} profile={profile} members={state.members} onClose={() => setFriends(false)} onAdded={() => void reload()} />}
      {settings && <Settings roomId={roomId} creds={profile ? { memberId: profile.profileId, secret: profile.secret } : creds} me={me} onClose={() => setSettings(false)} onChanged={() => void reload()} />}
      {roomSheet && (
        <RoomSheet
          roomId={roomId}
          creds={creds}
          name={state.room.name}
          set={state.room.set}
          onClose={() => setRoomSheet(false)}
          onChanged={() => void reload()}
        />
      )}
      {doors && <Doors phase={doors} onDone={() => setDoors(null)} />}
    </div>
  );
}

// ───────────────────────────── The strip: the chat as numbered frames, pulled up from under the stage ─────────────────────────────

const PEEK = 60;

function FilmStrip({
  messages,
  members,
  renderOf,
  meId,
  missed,
  playing,
  canReplay,
  lineTo,
  onReplay,
  onOpenChange,
}: {
  messages: Message[];
  members: Member[];
  renderOf: Map<string, Render>;
  meId: string;
  missed: Message[];
  playing: string | null;
  canReplay: boolean;
  lineTo: (m: Message) => string;
  onReplay: (m: Message) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const missedIds = useMemo(() => new Set(missed.map((m) => m.id)), [missed]);
  const nameOf = (id: string) => (id === meId ? "You" : members.find((m) => m.id === id)?.name ?? "Someone");
  const openH = () => Math.min(window.innerHeight * 0.72, 640);
  const last = messages.at(-1);
  const shown = (playing && messages.find((m) => m.id === playing)) || last;

  // opening lands on the newest frame; while it plays, the frame on stage stays in view
  useEffect(() => {
    if (open && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [open]);
  useEffect(() => {
    onOpenChange(open);
    if (!open) return;
    const again = () => onOpenChange(open); // a window that narrows past the breakpoint drops the side framing
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // on a phone the open strip covers most of the stage: when the table starts performing, fold it back to the peek
  useEffect(() => {
    if (playing && window.innerWidth < 1024) setOpen(false);
  }, [playing]);
  useEffect(() => {
    if (!open || !playing) return;
    list.current?.querySelector(`[data-id="${playing}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open, playing]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const height = dragH ?? (open ? openH() : PEEK);
  return (
    <div className="strip">
      <div className={`strip-sheet ${open ? "open" : ""} ${dragH !== null ? "dragging" : ""}`} style={{ height }}>
        <button
          className="strip-head"
          aria-expanded={open}
          aria-label={open ? "Close the chat" : "Open the chat"}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { y: e.clientY, h: open ? openH() : PEEK, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dy = d.y - e.clientY;
            if (!d.moved && Math.abs(dy) < 6) return;
            d.moved = true;
            setDragH(Math.max(PEEK, Math.min(openH(), d.h + dy)));
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (!d) return;
            if (!d.moved) setOpen((o) => !o);
            else setOpen((dragH ?? PEEK) > (PEEK + openH()) / 2);
            setDragH(null);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragH(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
        >
          {open || !shown ? (
            <span className="peek">
              <span className="edge">Chat</span>
              <span className="edge count">
                {messages.length} frames{missed.length > 0 && (
                  <>
                    {" · "}
                    <b>{missed.length} missed</b>
                  </>
                )}
              </span>
            </span>
          ) : (
            <span className="peek" style={{ ["--rib" as any]: ribbonOf(members, shown.member_id) }}>
              <span className="edge">{frameNo(shown.seq)}</span>
              <span className="edge who">{nameOf(shown.member_id)}</span>
              <span className="line">{shown.text}</span>
            </span>
          )}
          <Icon name="chevron" />
        </button>
        <ol className="frames" ref={list} aria-label="The chat, oldest first" hidden={!open && dragH === null}>
          {messages.length === 0 && <li className="empty">Nothing said yet. Hold to talk, or type, and the table performs it.</li>}
          {messages.map((m) => {
            const r = renderOf.get(m.id);
            const item = toItem(m, r);
            const to = lineTo(m);
            const status = !r || r.status === "pending" ? "Developing" : r.status === "verified" ? "Voice checked" : r.status === "silent" ? "Silent" : "Captions only";
            const direction = [r?.emotion !== "neutral" && r?.emotion, r?.gesture !== "none" && r?.gesture, r?.camera !== "room" && r?.camera && `${r.camera} shot`]
              .filter(Boolean)
              .map((x) => String(x).replace(/_/g, " "));
            return (
              <li key={m.id} data-id={m.id} style={{ ["--rib" as any]: ribbonOf(members, m.member_id) }}>
                <button
                  className={`frame ${missedIds.has(m.id) ? "missed" : ""} ${playing === m.id ? "playing" : ""}`}
                  disabled={!canReplay || !!playing}
                  onClick={() => onReplay(m)}
                  aria-label={`${nameOf(m.member_id)}: ${m.text}. Play this line again`}
                >
                  <span className="edge-row edge">
                    <span className="fno">{frameNo(m.seq)}</span>
                    <span className="who">{nameOf(m.member_id)}</span>
                    <span className="to">to {to === "all" ? "everyone" : to === meId ? "you" : nameOf(to)}</span>
                    <span className="t">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                  </span>
                  <span className="line" style={{ display: "block" }}>
                    {m.text}
                  </span>
                  <span className="edge-row meta edge">
                    {missedIds.has(m.id) && <span className="miss">Missed</span>}
                    <span className={r?.status === "verified" ? "ok" : ""}>{status}</span>
                    <span>{runTime(itemDuration(item))}</span>
                    {direction.length > 0 && <span>{direction.join(" · ")}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ───────────────────────────── Add a friend: demo friends (played by Spark) or an invite link ─────────────────────────────

type DemoFriend = { id: string; name: string; persona: string };
const SEED_FACE: Record<string, string> = { sam: "/seed/figures/sam/neutral.webp", mina: "/seed/figures/mina/neutral.webp", jay: "/seed/figures/jay/neutral.webp" };

function FriendsSheet({ roomId, creds, profile, members, onClose, onAdded }: { roomId: string; creds: Creds; profile: Profile | null; members: Member[]; onClose: () => void; onAdded: () => void }) {
  const [list, setList] = useState<DemoFriend[]>([]);
  const [mine, setMine] = useState<{ id: string; person: { id: string; name: string; face: string | null } | null }[]>([]);
  useEffect(() => {
    if (profile) api("/api/home", { method: "POST", json: { ...profile, seen: {} } }).then((r) => setMine(r.friends), () => void 0);
  }, [profile]);
  const seatFriend = async (friendId: string) => {
    setBusy(friendId);
    setErr("");
    try {
      await api("/api/friends", { method: "POST", json: { ...profile, action: "seat", roomId, friendId } });
      onAdded();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
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
  const link = typeof location === "undefined" ? "" : `${location.origin}/r/${roomId}`;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add a friend">
        <div className="sheet-head">
          Add a friend
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {profile && (
          <section>
            <h3>Your friends</h3>
            {mine.length === 0 ? (
              <p className="sub">No friends yet. Add them by code on the home screen (Friends).</p>
            ) : (
              <div className="friend-list">
                {mine.map((f) =>
                  f.person ? (
                    <div className="friend-row" key={f.id}>
                      <div className="face">{f.person.face && <img src={f.person.face} alt="" />}</div>
                      <div className="who">
                        <b>{f.person.name}</b>
                      </div>
                      {members.some((m) => m.profile_id === f.person!.id) ? (
                        <span className="here">At the table</span>
                      ) : (
                        <button className="ghost small" disabled={!!busy} onClick={() => void seatFriend(f.person!.id)}>
                          {busy === f.person.id ? "Seating…" : "Seat"}
                        </button>
                      )}
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </section>
        )}
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

function Composer({ creds, me, ribbon, disabled }: { creds: Creds; me: Member | null; ribbon: string; onSent: () => void; disabled: boolean }) {
  const rec = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recFor, setRecFor] = useState(0); // seconds held, shown on the tally
  useEffect(() => {
    if (!recording) return setRecFor(0);
    const t0 = Date.now();
    const iv = setInterval(() => setRecFor(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(iv);
  }, [recording]);

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
              “{preview}” <span className="edge">Sending · tap to edit</span>
              <i className="countdown" />
            </button>
          )}
        </div>
      )}
      {status && (
        <div className="status edge" role="status">
          {status}
        </div>
      )}
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
            {recording ? <span className="kbd-hint edge">Rec 0:{String(recFor).padStart(2, "0")}</span> : <span className="kbd-hint">or hold Space</span>}
          </button>
          <div className="me-chip" style={{ ["--rib" as any]: ribbon }} title={me?.name}>
            {me?.persona_url ? <img src={me.persona_url} alt="" /> : <span>{me?.name?.[0] ?? "?"}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function VoiceStep({ creds, onNext, compact, doneLabel = "Enter the room" }: { creds: Creds; onNext: () => void; compact?: boolean; doneLabel?: string }) {
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
            {compact ? "Done" : doneLabel}
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
                  <table className="receipt">
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

// ───────────────────────────── The room: its name and its set ─────────────────────────────

function RoomSheet({ roomId, creds, name, set, onClose, onChanged }: { roomId: string; creds: Creds; name: string; set: any; onClose: () => void; onChanged: () => void }) {
  const [n, setN] = useState(name);
  const [saved, setSaved] = useState(false);
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="The room">
        <div className="sheet-head">
          The room
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <section>
          <h3>Name</h3>
          <form
            className="invite-row plain"
            onSubmit={async (e) => {
              e.preventDefault();
              await api(`/api/rooms/${roomId}/set`, { method: "POST", json: { ...creds, name: n } });
              setSaved(true);
              onChanged();
            }}
          >
            <input value={n} onChange={(e) => (setN(e.target.value), setSaved(false))} maxLength={40} />
            <button className="ghost" type="submit" disabled={!n.trim() || n === name}>
              {saved ? "Saved" : "Rename"}
            </button>
          </form>
        </section>
        <section>
          <h3>The set</h3>
          <p className="sub">Everyone at the table sees the room change.</p>
          <RoomSetPicker roomId={roomId} creds={creds} current={set} onChanged={onChanged} />
        </section>
      </div>
    </div>
  );
}
