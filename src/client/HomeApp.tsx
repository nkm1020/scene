"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createHomeStage, type HomeStage } from "@/stage3d/home";
import { api } from "./api";
import { loadProfile, saveProfile, seenMap, type Profile } from "./profile";
import { Icon, Mark } from "./ui";
import FigureStudio from "./FigureStudio";
import { VoiceStep } from "./RoomApp";
import RoomSetPicker from "./RoomSet";
import Doors from "./Doors";

type Person = { id: string; name: string; face: string | null; code?: string };
type ChatRow = {
  id: string;
  name: string;
  kind: "group" | "dm" | "demo";
  seatId: string;
  people: { id: string; name: string; face: string | null; me: boolean; ai: boolean }[];
  last: { who: string; text: string; at: string; mine: boolean } | null;
  unread: number;
  at: string;
};
type FriendRow = { id: string; roomId: string | null; at: string; person: Person | null };
type Home = {
  profile: { id: string; name: string; persona_url: string | null; figure: any; figure_status: string | null; enrolled_voice: boolean; friend_code: string; home_room: string; set: any };
  rooms: ChatRow[];
  friends: FriendRow[];
  incoming: FriendRow[];
  outgoing: FriendRow[];
};

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export default function HomeApp() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [home, setHome] = useState<Home | null>(null);
  const [err, setErr] = useState("");
  const [doors, setDoors] = useState<{ to: string } | null>(null);
  const [customize, setCustomize] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [tab, setTab] = useState<"chats" | "friends">("chats");
  const [addCode, setAddCode] = useState("");
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
    const q = new URLSearchParams(location.search);
    if (q.get("add")) {
      setAddCode(q.get("add")!.toUpperCase());
      setTab("friends");
    }
    if (q.get("next")?.startsWith("/r/")) setNext(q.get("next"));
  }, []);

  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    const p = loadProfile();
    if (!p || inFlight.current) return;
    inFlight.current = true;
    try {
      const h = await api<Home>("/api/home", { method: "POST", json: { ...p, seen: seenMap() } });
      setHome(h);
      setErr("");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    if (!profile) return;
    void refresh();
    const iv = setInterval(() => document.visibilityState === "visible" && void refresh(), 4000);
    return () => clearInterval(iv);
  }, [profile, refresh]);

  const enter = (roomId: string) => setDoors({ to: `/r/${roomId}?door=1` });

  // a room link opened before you had a profile: go there once you have one
  useEffect(() => {
    if (profile && home && next) {
      setNext(null);
      setDoors({ to: `${next}${next.includes("?") ? "&" : "?"}door=1` });
    }
  }, [profile, home, next]);

  if (profile === undefined) return <div className="home" />;
  if (!profile)
    return (
      <Onboarding
        onDone={(p) => {
          saveProfile(p);
          setProfile(p);
        }}
      />
    );

  return (
    <div className="home">
      <Turntable figure={home?.profile.figure ?? null} set={home?.profile.set ?? null} spinKey={home?.profile.persona_url ?? ""} />
      <header className="home-top">
        <div className="home-id">
          <Mark label={false} />
          <div>
            <div className="home-name">{home?.profile.name ?? " "}</div>
            {home && (
              <button
                className="edge code"
                title="Your friend code"
                onClick={() => {
                  setTab("friends");
                }}
              >
                {home.profile.friend_code}
              </button>
            )}
          </div>
        </div>
        <button className="icon-btn custom" onClick={() => setCustomize(true)} aria-label="Customize your figure, voice and room" title="Customize">
          <Icon name="sliders" />
        </button>
      </header>
      {home?.profile.figure_status && home.profile.figure_status !== "ready" && (
        <div className="home-status edge" role="status">
          Muse Image is making your expressions and back views…
        </div>
      )}
      <HomeSheet
        home={home}
        tab={tab}
        setTab={setTab}
        profile={profile}
        addCode={addCode}
        setAddCode={setAddCode}
        onEnter={enter}
        onNewChat={() => setNewChat(true)}
        onChanged={() => void refresh()}
      />
      {err && <div className="home-err">{err}</div>}
      {customize && home && (
        <Customize
          profile={profile}
          home={home}
          onClose={() => setCustomize(false)}
          onChanged={() => void refresh()}
        />
      )}
      {newChat && home && (
        <NewChat
          profile={profile}
          friends={home.friends}
          onClose={() => setNewChat(false)}
          onMade={(roomId) => {
            setNewChat(false);
            enter(roomId);
          }}
        />
      )}
      {doors && <Doors phase="closing" onDone={() => router.push(doors.to)} />}
    </div>
  );
}

// ───────────────────────────── your figure on the turntable ─────────────────────────────

function Turntable({ figure, set, spinKey }: { figure: any; set: any; spinKey: string }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HomeStage | null>(null);
  const [hint, setHint] = useState(true);
  const setKey = set?.urls ? set.urls["wall-front"] : set?.theme ?? "dining";
  const figKey = figure ? Object.keys(figure).sort().join(",") + spinKey : "";
  useEffect(() => {
    if (!host.current) return;
    stage.current = createHomeStage(host.current, { figure, set });
    const sheet = () => stage.current?.setBottomInset(Math.min(window.innerHeight * 0.42, 380));
    sheet();
    window.addEventListener("resize", sheet);
    return () => {
      window.removeEventListener("resize", sheet);
      stage.current?.destroy();
      stage.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stage.current?.setFigure(figure), [figKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stage.current?.setRoom(set), [setKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="home-stage" ref={host} onPointerDown={() => setHint(false)} onWheel={() => setHint(false)}>
      {hint && <div className="home-hint edge">Drag to turn · pinch to zoom</div>}
    </div>
  );
}

// ───────────────────────────── the sheet: chats and friends ─────────────────────────────

function HomeSheet({
  home,
  tab,
  setTab,
  profile,
  addCode,
  setAddCode,
  onEnter,
  onNewChat,
  onChanged,
}: {
  home: Home | null;
  tab: "chats" | "friends";
  setTab: (t: "chats" | "friends") => void;
  profile: Profile;
  addCode: string;
  setAddCode: (s: string) => void;
  onEnter: (roomId: string) => void;
  onNewChat: () => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = (home?.rooms ?? []).reduce((t, r) => t + r.unread, 0);
  const asks = home?.incoming.length ?? 0;
  return (
    <section className={`home-sheet ${open ? "open" : ""}`} aria-label="Chats and friends">
      <button className="grab" onClick={() => setOpen((o) => !o)} aria-label={open ? "Lower the sheet" : "Raise the sheet"}>
        <i />
      </button>
      <div className="sheet-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "chats"} className={tab === "chats" ? "on" : ""} onClick={() => setTab("chats")}>
          Chats{unread > 0 && <b className="count">{unread}</b>}
        </button>
        <button role="tab" aria-selected={tab === "friends"} className={tab === "friends" ? "on" : ""} onClick={() => setTab("friends")}>
          Friends{asks > 0 && <b className="count">{asks}</b>}
        </button>
        {tab === "chats" && (
          <button className="primary small new" onClick={onNewChat}>
            New chat
          </button>
        )}
      </div>
      <div className="sheet-body">
        {!home && <p className="sub pad">Opening your chats…</p>}
        {home && tab === "chats" && <ChatList rooms={home.rooms} onEnter={onEnter} />}
        {home && tab === "friends" && <FriendsTab home={home} profile={profile} addCode={addCode} setAddCode={setAddCode} onEnter={onEnter} onChanged={onChanged} />}
      </div>
    </section>
  );
}

function Faces({ people }: { people: { face: string | null; name: string }[] }) {
  return (
    <span className="faces">
      {people.slice(0, 3).map((p, i) => (
        <span className="face" key={i}>
          {p.face ? <img src={p.face} alt="" /> : <b>{p.name[0]}</b>}
        </span>
      ))}
    </span>
  );
}

function ChatList({ rooms, onEnter }: { rooms: ChatRow[]; onEnter: (id: string) => void }) {
  if (!rooms.length) return <p className="sub pad">No chats yet.</p>;
  return (
    <ul className="chat-list">
      {rooms.map((r) => {
        const others = r.people.filter((p) => !p.me);
        const title = r.kind === "dm" ? others[0]?.name ?? r.name : r.name;
        return (
          <li key={r.id}>
            <button className="chat-row" onClick={() => onEnter(r.id)}>
              <Faces people={others.length ? others : r.people} />
              <span className="what">
                <span className="top">
                  <b>{title}</b>
                  {r.kind === "demo" && <span className="tag edge">Script</span>}
                  <span className="edge t">{r.last ? when(r.last.at) : ""}</span>
                </span>
                <span className="line">
                  {r.kind === "demo" && !r.last ? "A scripted chat to show the table performing" : r.last ? `${r.last.mine ? "You" : r.last.who}: ${r.last.text}` : "Nothing said yet"}
                </span>
              </span>
              {r.unread > 0 && <b className="unread">{r.unread > 99 ? "99+" : r.unread}</b>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FriendsTab({ home, profile, addCode, setAddCode, onEnter, onChanged }: { home: Home; profile: Profile; addCode: string; setAddCode: (s: string) => void; onEnter: (id: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const link = typeof location === "undefined" ? "" : `${location.origin}/home?add=${home.profile.friend_code}`;
  const act = async (key: string, json: any, then?: (r: any) => void) => {
    setBusy(key);
    setMsg("");
    try {
      const r = await api("/api/friends", { method: "POST", json: { ...profile, ...json } });
      then?.(r);
      onChanged();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="friends-tab">
      {home.incoming.length > 0 && (
        <section>
          <h3>Asking to be friends</h3>
          <div className="friend-list">
            {home.incoming.map((r) => (
              <div className="friend-row" key={r.id}>
                <div className="face">{r.person?.face && <img src={r.person.face} alt="" />}</div>
                <div className="who">
                  <b>{r.person?.name}</b>
                  <span className="edge">{r.person?.code}</span>
                </div>
                <button className="ghost small" disabled={!!busy} onClick={() => void act(r.id + "n", { action: "answer", requestId: r.id, accept: false })}>
                  Decline
                </button>
                <button className="primary small" disabled={!!busy} onClick={() => void act(r.id, { action: "answer", requestId: r.id, accept: true }, (x) => x.roomId && setMsg(`You and ${r.person?.name} are friends. Your chat is in Chats.`))}>
                  {busy === r.id ? "…" : "Accept"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <h3>Add a friend</h3>
        <form
          className="invite-row"
          onSubmit={(e) => {
            e.preventDefault();
            void act("add", { action: "request", code: addCode }, (r) => {
              setMsg(r.status === "friends" ? `You and ${r.name} are friends now.` : `Asked ${r.name}. They see your request on their home screen.`);
              setAddCode("");
            });
          }}
        >
          <input value={addCode} onChange={(e) => setAddCode(e.target.value.toUpperCase())} placeholder="Their code, e.g. SCN-4F2K" aria-label="Friend code" maxLength={9} />
          <button className="primary small" type="submit" disabled={!addCode.trim() || !!busy}>
            {busy === "add" ? "…" : "Ask"}
          </button>
        </form>
        <div className="my-code">
          <span>
            Your code <b className="edge">{home.profile.friend_code}</b>
          </span>
          <button
            className="ghost small"
            onClick={() => {
              if (navigator.share) void navigator.share({ title: "Scene", text: `Add me on Scene: ${home.profile.friend_code}`, url: link }).catch(() => void 0);
              else {
                void navigator.clipboard?.writeText(link);
                setCopied(true);
              }
            }}
          >
            {copied ? "Link copied" : "Share link"}
          </button>
        </div>
        {msg && <p className="sub note">{msg}</p>}
      </section>
      <section>
        <h3>Friends{home.friends.length ? ` · ${home.friends.length}` : ""}</h3>
        {home.friends.length === 0 && <p className="sub">No friends yet. Send someone your code; when they ask and you accept, a chat for the two of you opens.</p>}
        {home.friends.length > 0 && (
          <div className="friend-list">
            {home.friends.map((r) => (
              <button className="friend-row" key={r.id} onClick={() => r.roomId && onEnter(r.roomId)}>
                <div className="face">{r.person?.face && <img src={r.person.face} alt="" />}</div>
                <div className="who">
                  <b>{r.person?.name}</b>
                  <span className="edge">{r.person?.code}</span>
                </div>
                <span className="go edge">Chat</span>
              </button>
            ))}
          </div>
        )}
        {home.outgoing.length > 0 && <p className="sub note">Waiting for {home.outgoing.map((r) => r.person?.name).join(", ")} to accept.</p>}
      </section>
    </div>
  );
}

// ───────────────────────────── customize: figure, voice, room ─────────────────────────────

function Customize({ profile, home, onClose, onChanged }: { profile: Profile; home: Home; onClose: () => void; onChanged: () => void }) {
  const [view, setView] = useState<"figure" | "voice" | "room">("figure");
  const creds = { memberId: profile.profileId, secret: profile.secret };
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Customize">
        <div className="sheet-head">
          Customize
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-tabs">
          {(["figure", "voice", "room"] as const).map((v) => (
            <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
              {v === "figure" ? "Figure" : v === "voice" ? "Voice" : "Room"}
            </button>
          ))}
        </div>
        {view === "figure" && (
          <FigureStudio
            creds={creds}
            compact
            neutral={home.profile.persona_url}
            onDone={() => {
              onChanged();
              onClose();
            }}
          />
        )}
        {view === "voice" && (
          <>
            <p className="sub">{home.profile.enrolled_voice ? "Your voice is registered. Every chat you sit in speaks your lines in it." : "You speak with a preset voice until you register your own."}</p>
            <VoiceStep creds={creds} compact onNext={onChanged} />
          </>
        )}
        {view === "room" && (
          <>
            <p className="sub">The room your figure stands in on this screen.</p>
            <RoomSetPicker roomId={home.profile.home_room} creds={creds} current={home.profile.set} onChanged={onChanged} />
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── new chat: a group of your friends ─────────────────────────────

function NewChat({ profile, friends, onClose, onMade }: { profile: Profile; friends: FriendRow[]; onClose: () => void; onMade: (roomId: string) => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const make = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ roomId: string }>("/api/friends", { method: "POST", json: { ...profile, action: "group", name, friends: [...picked] } });
      onMade(r.roomId);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New chat">
        <div className="sheet-head">
          New chat
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <section>
          <h3>Name</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Our table" maxLength={40} />
        </section>
        <section>
          <h3>Who sits at the table</h3>
          {friends.length === 0 ? (
            <p className="sub">Add friends first (Friends tab), or start an empty table and seat demo friends played by Muse Spark inside.</p>
          ) : (
            <div className="friend-list">
              {friends.map((r) =>
                r.person ? (
                  <label className="friend-row" key={r.id}>
                    <div className="face">{r.person.face && <img src={r.person.face} alt="" />}</div>
                    <div className="who">
                      <b>{r.person.name}</b>
                    </div>
                    <input
                      type="checkbox"
                      checked={picked.has(r.person.id)}
                      onChange={(e) =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(r.person!.id);
                          else n.delete(r.person!.id);
                          return n;
                        })
                      }
                    />
                  </label>
                ) : null,
              )}
            </div>
          )}
        </section>
        {err && <p className="err">{err}</p>}
        <button className="primary wide" disabled={busy} onClick={() => void make()}>
          {busy ? "Setting the table…" : picked.size ? `Start with ${picked.size} friend${picked.size > 1 ? "s" : ""}` : "Start an empty table"}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── first time: name, voice, figure ─────────────────────────────

function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState<"name" | "voice" | "figure">("name");
  const [name, setName] = useState("");
  const [preset, setPreset] = useState("female_a");
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const creds = useMemo(() => (p ? { memberId: p.profileId, secret: p.secret } : null), [p]);
  const start = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ profileId: string; secret: string }>("/api/profile", { method: "POST", json: { name, preset } });
      const prof = { profileId: r.profileId, secret: r.secret };
      saveProfile(prof); // keep it even if the tab closes mid-way
      setP(prof);
      setStep("voice");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const steps = ["name", "voice", "figure"] as const;
  return (
    <div className="home onboard">
      <div className="onboard-card sheet">
        <div className="steps edge">
          {steps.map((s, i) => (
            <span key={s} className={s === step ? "on" : steps.indexOf(step) > i ? "done" : ""}>
              {String(i + 1).padStart(2, "0")} {s === "name" ? "Name" : s === "voice" ? "Voice" : "Figure"}
            </span>
          ))}
        </div>
        {step === "name" && (
          <>
            <h1>Who&apos;s coming to the table?</h1>
            <p className="sub">Your friends will see you as a clay figure at their table, saying your messages in your own voice.</p>
            <label className="lbl">Your name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Kangmin" autoFocus onKeyDown={(e) => e.key === "Enter" && name.trim() && void start()} />
            <label className="lbl">Voice until you register yours</label>
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
            <button className="primary wide" disabled={!name.trim() || busy} onClick={() => void start()}>
              {busy ? "…" : "Continue"}
            </button>
            <p className="fine">No account and no email. Your key stays in this browser.</p>
          </>
        )}
        {step === "voice" && creds && <VoiceStep creds={creds} doneLabel="Continue" onNext={() => setStep("figure")} />}
        {step === "figure" && creds && p && <FigureStudio creds={creds} onDone={() => onDone(p)} />}
      </div>
    </div>
  );
}
