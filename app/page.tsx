"use client";
import { useEffect, useRef, useState } from "react";
import LandingStage, { type LandingStageHandle } from "@/client/LandingStage";
import { Mark } from "@/client/ui";
import { ruleDirection } from "@/core/rules";
import "./landing.css";

const FRIENDS = [
  { id: "sam", name: "Sam" },
  { id: "mina", name: "Mina" },
  { id: "jay", name: "Jay" },
];
const ROSTER = [
  { member_id: "sam", name: "Sam", present: true },
  { member_id: "mina", name: "Mina", present: true },
  { member_id: "jay", name: "Jay", present: false },
];
const EMOTION_WORDS: Record<string, string> = {
  neutral: "plainly",
  happy: "smiling",
  laughing: "laughing",
  surprised: "startled",
  angry: "exasperated",
  sad: "quietly",
};
const POSE_WORDS: Record<string, string> = {
  neutral: "listens",
  happy: "smiles",
  laughing: "laughs",
  surprised: "wakes up, startled",
  angry: "frowns",
  sad: "looks down",
  away: "keeps dozing",
};

export default function Home() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [line, setLine] = useState("Jay, don't look in the fridge!!");
  const [who, setWho] = useState("sam");
  const stage = useRef<LandingStageHandle>(null);

  const go = async (demo: boolean) => {
    setBusy(demo ? "demo" : "new");
    setErr("");
    // the app: name, voice and figure first, then your home with the demo chat (a script) and your real chats
    location.href = "/home";
  };

  // the table follows the reading: each section starts the chat at the line it talks about
  useEffect(() => {
    document.documentElement.classList.add("rise-on");
    const els = [...document.querySelectorAll<HTMLElement>("[data-line]")];
    let last = -1;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          const i = Number(e.target.getAttribute("data-line"));
          if (i !== last) ((last = i), stage.current?.playFrom(i));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    // entrances: each section's parts rise in once, in order
    const rise = new IntersectionObserver(
      (es) =>
        es.forEach(
          (e) =>
            e.isIntersecting &&
            (e.target.classList.add("in"), rise.unobserve(e.target)),
        ),
      { rootMargin: "0px 0px -12% 0px" },
    );
    document.querySelectorAll(".rise").forEach((el) => rise.observe(el));
    return () => (io.disconnect(), rise.disconnect());
  }, []);

  const d = ruleDirection(
    { id: "typed", sender_id: who, sender_name: who, text: line || "…" },
    ROSTER,
  );
  const speaker = FRIENDS.find((f) => f.id === who)!.name;

  return (
    <div className="land-page">
      <div className="land">
        <aside className="land-stage" data-ui>
          <LandingStage ref={stage} />
        </aside>

        <main className="land-read">
          <header className="land-card" data-line="0">
            <div className="perfs" aria-hidden="true">
              {Array.from({ length: 24 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <Mark />
            <h1>Your group chat, performed.</h1>
            <p className="lead">
              Your friends sit around a miniature table as clay figures and say
              each message in their own voice: exactly what they typed, nothing
              else.
            </p>
            <div className="land-actions">
              <button
                className="land-btn"
                onClick={() => go(true)}
                disabled={!!busy}
              >
                {busy === "demo" ? "Opening Scene…" : "Open Scene"}
              </button>
              <button
                className="land-link"
                onClick={() => go(false)}
                disabled={!!busy}
              >
                {busy === "new" ? "Setting the table…" : "Start your own room"}
              </button>
            </div>
            {err && <p className="err">{err}</p>}
            <nav className="land-nav" aria-label="On this page">
              <a href="#try">Try a line</a>
              <a href="#how">How it works</a>
              <a href="#run">Run it yourself</a>
            </nav>
          </header>

          <section id="try" className="land-try" data-line="2">
            <h2 className="rise">Make the table say something</h2>
            <p className="rise">
              Type a line and pick who says it. The figure beside you performs
              it, and the others react the way the room&apos;s rules read it.
            </p>
            <form
              className="try-form rise"
              onSubmit={(e) => {
                e.preventDefault();
                if (!line.trim()) return;
              // on a phone the table is above the fold: bring it into view first
              if (window.matchMedia("(max-width: 900px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
              stage.current?.say(who, line.trim());
              }}
            >
              <div
                className="try-who"
                role="radiogroup"
                aria-label="Who says it"
              >
                {FRIENDS.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    role="radio"
                    aria-checked={who === f.id}
                    className={who === f.id ? "on" : ""}
                    onClick={() => setWho(f.id)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
              <textarea
                value={line}
                onChange={(e) => setLine(e.target.value.slice(0, 120))}
                rows={2}
                aria-label="The line"
              />
              <button className="land-btn" type="submit">
                Perform it
              </button>
            </form>
            <div className="try-out rise" data-ui>
              <p>
                <b>{speaker}</b> says it {EMOTION_WORDS[d.emotion]}
                {d.gesture !== "none"
                  ? `, with a ${d.gesture.replace("_", " ")}`
                  : ""}
                {d.camera === "close" ? ", and the camera moves in." : "."}
              </p>
              <ul>
                {(d.reactions ?? [])
                  .filter((r) => r.member_id !== who)
                  .map((r) => (
                    <li key={r.member_id}>
                      {FRIENDS.find((f) => f.id === r.member_id)!.name}{" "}
                      {POSE_WORDS[r.pose]}
                      {r.pose === "surprised" ? " (their name came up)" : ""}
                    </li>
                  ))}
              </ul>
            </div>
          </section>

          <section id="how" className="land-how">
            <h2 className="rise">What happens to a message</h2>
            <div className="step" data-line="0">
              <p className="rise">
                <b>When you talk,</b> you hold the button and Muse Voice
                Transcribe writes it down. You see the words for a second and a
                half and can fix them. The message is text; your audio is not
                kept.
              </p>
              <div className="evidence rise" data-ui>
                <div className="ev-preview">
                  “ok Friday 7pm. everyone hide in the kitchen”
                  <span>Tap to edit · sending in 1.5 s</span>
                </div>
              </div>
            </div>
            <div className="step" data-line="2">
              <p className="rise">
                <b>Before it plays,</b> your friend&apos;s registered voice
                speaks it, and Voice Transcribe listens to the result. If it
                heard anything that was not typed, the line is made again, and
                after three tries it plays as a caption.
              </p>
              <div className="evidence rise" data-ui>
                <table className="ev-log">
                  <tbody>
                    <tr>
                      <td>Sam</td>
                      <td>“DO NOT tell Jay”</td>
                      <td />
                    </tr>
                    <tr className="no">
                      <td>Try 1</td>
                      <td>heard “Tangira Blackford said, do not tell Jay.”</td>
                      <td className="num">0.00</td>
                    </tr>
                    <tr className="yes">
                      <td>Try 2</td>
                      <td>heard “Do not tell Jay!”</td>
                      <td className="num">1.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="step" data-line="3">
              <p className="rise">
                <b>If you missed it,</b> Muse Spark reads the whole stretch and
                directs the table in one call: who says it how, who laughs,
                where the camera goes, and that Jay, asleep, wakes up when his
                name comes up. Its answer has no field for words, so it cannot
                change one.
              </p>
              <div className="evidence rise" data-ui>
                <table className="ev-dir">
                  <tbody>
                    <tr>
                      <td>Sam</td>
                      <td>DO NOT tell Jay</td>
                      <td>exasperated · shakes head · close</td>
                    </tr>
                    <tr>
                      <td>Jay</td>
                      <td>tell me what</td>
                      <td>wakes up · startled</td>
                    </tr>
                    <tr>
                      <td>Mina</td>
                      <td>...</td>
                      <td>looks down · pause 0.9 s</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="step" data-line="7">
              <p className="rise">
                <b>Your figure</b> is sculpted by Muse Image from three picks.
                Change the hair, the top or an extra, or just say what you want,
                and your face stays exactly as it was: SAM 3.1 found it once and
                it is put back on every change.
              </p>
              <div className="evidence looks rise">
                {["waves", "curls", "buns", "ponytail", "buzz", "said"].map(
                  (k) => (
                    <img
                      key={k}
                      src={`/landing/look-${k}.webp`}
                      width={160}
                      height={160}
                      alt={
                        k === "said"
                          ? "The same face after asking for a red beanie and round glasses"
                          : `The same face with ${k} hair`
                      }
                      loading="lazy"
                    />
                  ),
                )}
              </div>
            </div>
          </section>

          <section className="land-made rise" data-line="5">
            <h2>Made with Meta&apos;s models</h2>
            <p className="made-row">
              <span>Muse Spark 1.3</span>
              <span>Muse Image</span>
              <span>Muse Voice Transcribe</span>
              <span>SAM 3.1</span>
              <span>SAM 3D Objects</span>
            </p>
          </section>

          <section className="land-feats">
            <h2 className="rise">The small things that make it a scene</h2>
            <div className="feat" data-line="11">
              <div className="feat-panel frames rise">
                {["talk_a", "talk_b", "blink"].map((k) => (
                  <span key={k}>
                    <img
                      src={`/seed/figures/mina/${k}.webp`}
                      width={120}
                      height={120}
                      alt={`Mina, replacement frame ${k.replace("_", " ")}`}
                      loading="lazy"
                    />
                  </span>
                ))}
              </div>
              <div className="feat-text rise">
                <h3>Twelve pictures a second</h3>
                <p>
                  Muse Image makes replacement frames for every figure: two
                  mouth shapes, a blink, a groggy wake-up. The table swaps them
                  like a stop-motion film swaps faces.
                </p>
              </div>
            </div>
            <div className="feat" data-line="6">
              <div className="feat-panel rise" data-ui>
                <ul className="ev-friends">
                  {[
                    ["sam", "Sam", "The planner"],
                    ["mina", "Mina", "Warm and teasing"],
                    ["jay", "Jay", "Asleep, mostly"],
                  ].map(([id, n, p]) => (
                    <li key={id}>
                      <span className="face">
                        <img
                          src={`/seed/figures/${id}/neutral.webp`}
                          width={44}
                          height={44}
                          alt=""
                          loading="lazy"
                        />
                      </span>
                      <b>{n}</b>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="feat-text rise">
                <h3>Friends for trying it alone</h3>
                <p>
                  Seat Sam, Mina or Jay in any room. Muse Spark plays them, a
                  validator checks every reply, and they answer what you post.
                </p>
              </div>
            </div>
            <div className="feat" data-line="9">
              <div className="feat-panel rise" data-ui>
                <table className="ev-receipt">
                  <tbody>
                    <tr>
                      <td>Spark directs 12 lines</td>
                      <td className="num">$0.017</td>
                    </tr>
                    <tr>
                      <td>Voice Transcribe, 3 checks</td>
                      <td className="num">$0.002</td>
                    </tr>
                    <tr>
                      <td>Six outfits drawn on you</td>
                      <td className="num">$0.060</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="feat-text rise">
                <h3>Every call on the receipt</h3>
                <p>
                  Each room keeps a receipt: every model call with its time,
                  tokens and cost, so you can see what one performance costs.
                </p>
              </div>
            </div>
            <div className="feat" id="run" data-line="10">
              <div className="feat-panel rise">
                <pre>
                  <code>{`cp .env.example .env   # META_API_KEY
npm install
npm run demo -- --voice none`}</code>
                </pre>
              </div>
              <div className="feat-text rise">
                <h3>One key, one command</h3>
                <p>
                  No login and no account. The demo sculpts the cast, has Spark
                  direct the table and writes the replay and its receipt.
                </p>
              </div>
            </div>
          </section>

          <section className="land-cta" data-line="11">
            <p className="rise">
              Sam, Mina and Jay are at the table with a cake. Pull up a chair.
            </p>
            <button
              className="land-btn rise"
              onClick={() => go(true)}
              disabled={!!busy}
            >
              {busy === "demo" ? "Opening Scene…" : "Open Scene"}
            </button>
          </section>
        </main>
      </div>

      <footer className="land-foot">
        <div className="foot-photo">
          <img
            src="/seed/figures/mina/laughing.webp"
            width={800}
            height={800}
            alt="Mina, laughing, a clay figure on her stool"
            loading="lazy"
          />
        </div>
        <div className="foot-menu">
          <Mark />
          <nav aria-label="Scene">
            <button onClick={() => go(true)}>Open Scene</button>
            <button onClick={() => go(false)}>Start a room</button>
            <a href="#how">How it works</a>
            <a href="#run">Run it yourself</a>
          </nav>
          <p className="foot-note">
            Built for the Meta AI Developer Hackathon 2026. The idea was
            prototyped before the hackathon; everything here was written during
            it. Voices: Qwen3-TTS, self-hosted, checked by Meta&apos;s models.
          </p>
        </div>
      </footer>
    </div>
  );
}
