"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import LandingReel, { EXPOSURES } from "@/client/LandingReel";
import LandingStage, { type LandingStageHandle } from "@/client/LandingStage";
import { ruleDirection } from "@/core/rules";
import "./landing.css";

const LIVE = "https://scene-lovat.vercel.app";
const PRIOR = "https://github.com/nkm1020/UJHS-Ambition-for-Korea";

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

// what happens to a message: each statement starts the table at the line it talks about
const STEPS = [
  {
    line: 0,
    say: "You type it, or hold the button and say it.",
    more: "Muse Voice Transcribe writes down what you said. You see the words for a second and a half and can fix them. Your audio is not kept.",
  },
  {
    line: 2,
    say: "It is spoken aloud, then checked word for word.",
    more: "Voice Transcribe listens to every spoken line. If it heard anything that was not typed, the line is made again; after three tries it plays as a caption.",
  },
  {
    line: 3,
    say: "Missed it? Muse Spark directs the replay.",
    more: "In one call Spark decides who says each line how, who laughs, where the camera goes, and that Jay wakes up when his name comes up. Its answer has no field for words, so it cannot change one.",
  },
];

// the close-ups: each frame is one thing you make, and its card steps one column right
const YOURS = [
  {
    id: "figure",
    name: "Your figure",
    line: "Three picks, sculpted in clay by Muse Image.",
    fact: "Change the hair, the top or an extra, or just say it. SAM 3.1 found your face once and puts it back on every change.",
    pic: "/landing/close-figure.webp",
    picAlt: "Mina, a clay figure in a yellow cardigan, smiling in front of the dining room's sage wall and wooden door",
    small: "/landing/cast/mina-neutral.webp",
    smallAlt: "Mina's whole figure on her wooden stool",
    act: "Make yours",
  },
  {
    id: "room",
    name: "Your room",
    line: "A dining room, a corner cafe, a rooftop at night.",
    fact: "Or say any room. Muse Spark plans it and Muse Image paints its six surfaces in about 30 seconds, for six cents.",
    pic: "/landing/close-room.webp",
    picAlt: "The corner cafe set: a mustard clay wall, green clay tiles and a door with a brass bell",
    small: "/set/rooftop/wall-back.webp",
    smallAlt: "The rooftop set: a brick parapet and a small lit doorway under clay stars",
    act: "Set your room",
  },
  {
    id: "friends",
    name: "Friends to try it alone",
    line: "Sam, Mina and Jay, played by Muse Spark.",
    fact: "Seat them in any room and they answer what you post. A validator keeps only short lines from friends who are at the table.",
    pic: "/landing/close-friends.webp",
    picAlt: "Sam, Mina and a sleeping Jay as clay figures on stools in front of a brick rooftop wall at night",
    small: "/landing/frames/12.webp",
    smallAlt: "Sam, Mina and Jay at the clay table while Jay sleeps",
    act: "Seat them",
  },
];

// the small things, stepping past the doors to every chat
const DETAILS: { say: string; pics: { src: string; alt: string; cut?: boolean }[]; receipt?: boolean }[] = [
  {
    say: "Twelve pictures a second, like stop motion.",
    pics: [
      { src: "/landing/cast/mina-talk_a.webp", alt: "Mina's replacement frame with her mouth open", cut: true },
      { src: "/landing/cast/mina-blink.webp", alt: "Mina's replacement frame mid-blink", cut: true },
    ],
  },
  {
    say: "Dress up, and your face stays exactly yours.",
    pics: [
      { src: "/landing/look-waves.webp", alt: "The same clay face with wavy hair" },
      { src: "/landing/look-said.webp", alt: "The same face after asking for a red beanie and round glasses" },
    ],
  },
  {
    say: "Everyone turns to whoever is talking.",
    pics: [
      { src: "/landing/cast/sam-q3.webp", alt: "Sam turned three-quarters on his stool", cut: true },
      { src: "/landing/cast/jay-side.webp", alt: "Jay seen from the side", cut: true },
    ],
  },
  {
    say: "Say a room, and the walls are repainted.",
    pics: [
      { src: "/set/cafe/wall-left.webp", alt: "A wall of the corner cafe set" },
      { src: "/set/rooftop/wall-left.webp", alt: "A wall of the rooftop set" },
    ],
  },
  {
    say: "Every model call lands on the receipt.",
    pics: [{ src: "/landing/cast/jay-wake.webp", alt: "Jay waking up, groggy", cut: true }],
    receipt: true,
  },
];

const MODELS = [
  ["Muse Image", "Sculpts every figure, its expressions and stop-motion frames, and paints the sets", "Once per figure", "$0.01 a picture"],
  ["SAM 3.1", "Cuts out every figure and prop, and finds your face so dressing up never changes it", "Every picture", "$2.50 per 1,000"],
  ["Muse Spark 1.3", "Directs the table, plans rooms from words, plays Sam, Mina and Jay", "Every replay", "$0.017 for 12 lines"],
  ["Muse Voice Transcribe", "Writes down what you say, checks every spoken line and your consent read", "Every line", "$0.18 an hour"],
  ["SAM 3D Objects", "Lifts each figure into a mesh that sits at the table; optional, through fal.ai", "With a fal.ai key", "fal.ai pricing"],
];
const OUTSIDE = [
  ["OpenAI gpt-4o-mini-tts", "Speaks the lines in preset voices, told each line's mood; Meta has no text-to-speech", "With an OpenAI key", "OpenAI pricing"],
  ["Qwen3-TTS", "Speaks a line in your own registered voice; Voice Transcribe checks it", "With a voice server", "Self-hosted"],
  ["Supabase", "Stores rooms and syncs them between friends", "Always", "Free tier"],
];

export default function Home() {
  const [frame, setFrame] = useState(2);
  const onFrame = useCallback((i: number) => setFrame(i), []);
  const x = EXPOSURES[frame];

  const [step, setStep] = useState(0);
  const [line, setLine] = useState("Jay, don't look in the fridge!!");
  const [who, setWho] = useState("sam");
  const [said, setSaid] = useState(false);
  const stage = useRef<LandingStageHandle>(null);
  const [detail, setDetail] = useState(-1);

  useEffect(() => {
    document.documentElement.classList.add("lp-js");
    // the table follows the reading: each statement starts the chat at the line it talks about
    let last = -1;
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          const s = Number(e.target.getAttribute("data-step"));
          setStep(s);
          const l = Number(e.target.getAttribute("data-line"));
          if (l >= 0 && l !== last) ((last = l), stage.current?.playFrom(l));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    document.querySelectorAll("[data-step]").forEach((el) => io.observe(el));
    const dio = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setDetail(Number(e.target.getAttribute("data-detail")))),
      { rootMargin: "-50% 0px -50% 0px" },
    );
    document.querySelectorAll("[data-detail]").forEach((el) => dio.observe(el));
    // entrances: each section's parts rise in once, in reading order. Anything already scrolled past counts as seen,
    // so a jump (a nav link, a fast fling) never leaves a section waiting
    let left = [...document.querySelectorAll<HTMLElement>(".rise")];
    let raf = 0;
    const reveal = () => {
      raf = 0;
      const line = innerHeight * 0.9;
      left = left.filter((el) => (el.getBoundingClientRect().top < line ? (el.classList.add("in"), false) : true));
      if (!left.length) removeEventListener("scroll", ask);
    };
    const ask = () => (raf ||= requestAnimationFrame(reveal));
    addEventListener("scroll", ask, { passive: true });
    reveal();
    return () => (io.disconnect(), dio.disconnect(), removeEventListener("scroll", ask), cancelAnimationFrame(raf));
  }, []);

  const d = ruleDirection({ id: "typed", sender_id: who, sender_name: who, text: line || "…" }, ROSTER);
  const speaker = FRIENDS.find((f) => f.id === who)!.name;

  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-word" href="/">Scene</a>
        <nav aria-label="On this page">
          <a href="#how">How it works</a>
          <a href="#models">Models</a>
          <a href="#run">Run it yourself</a>
        </nav>
      </header>

      <div className="lp-pin" data-pin>
        <section className="lp-hero">
          <h1 className="lp-h1">
            <span className="line l1"><span data-line style={{ "--i": 0 } as React.CSSProperties}>Your group chat,</span></span>
            <span className="line l2"><span data-line style={{ "--i": 1 } as React.CSSProperties}>performed.</span></span>
          </h1>
          <LandingReel onFrame={onFrame} />
          <div className="lp-hero-foot">
            <p className="lp-lead">
              Your friends sit at a miniature table as clay figures and say each message in their own voice:
              exactly what they typed, nothing else.
            </p>
            <a className="lp-btn" href="/home">Open Scene</a>
          </div>
          <p className="lp-hero-cap" aria-live="polite">
            <b>{x.who}</b> {x.line === "..." ? "says nothing, pointedly." : <>says “{x.line}”</>}
          </p>
        </section>
      </div>

      {/* how it works: the live table holds on the right while the statements pass on the left */}
      <section id="how" className="lp-how">
        <div className="how-read">
          <h2 className="lp-h2 rise">What happens to a message</h2>
          {STEPS.map((s, i) => (
            <div className={`how-step${step === i ? " on" : ""}`} data-step={i} data-line={s.line} key={i}>
              <p className="how-say rise">{s.say}</p>
              <p className="how-more rise">{s.more}</p>
            </div>
          ))}
          <div className={`how-step how-try${step === 3 ? " on" : ""}`} data-step={3} data-line={-1}>
            <p className="how-say rise">Now you: make the table say something.</p>
            <form
              className="try rise"
              onSubmit={(e) => {
                e.preventDefault();
                if (!line.trim()) return;
                // on a phone the table sits above the statements: bring it into view first
                if (matchMedia("(max-width: 900px)").matches) document.querySelector(".how-stage")?.scrollIntoView({ behavior: "smooth", block: "center" });
                stage.current?.say(who, line.trim());
                setSaid(true);
              }}
            >
              <div className="try-who" role="radiogroup" aria-label="Who says it">
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
              <label className="try-line">
                <span>The line</span>
                <textarea value={line} onChange={(e) => setLine(e.target.value.slice(0, 120))} rows={2} />
              </label>
              <button className="lp-btn" type="submit">Perform it</button>
            </form>
          </div>
        </div>

        <div className="how-stage">
          <div className="how-table" data-ui>
            <LandingStage ref={stage} />
          </div>
          <div className="how-frag" data-ui aria-live="polite">
            {step === 0 && (
              <div className="frag-send">
                <p>ok Friday 7pm. everyone hide in the kitchen</p>
                <span className="edge">Tap to edit · sending in 1.5 s</span>
              </div>
            )}
            {step === 1 && (
              <table className="frag-tab">
                <caption className="edge">Sam · “DO NOT tell Jay” · read back</caption>
                <tbody>
                  <tr className="no"><td className="edge">Try 1</td><td>heard “Tangira Blackford said, do not tell Jay.”</td><td className="n">0.00</td></tr>
                  <tr className="yes"><td className="edge">Try 2</td><td>heard “Do not tell Jay!”</td><td className="n">1.00</td></tr>
                </tbody>
              </table>
            )}
            {step === 2 && (
              <table className="frag-tab">
                <caption className="edge">Spark directed · 3 lines · 1 call</caption>
                <tbody>
                  <tr><td className="edge">Sam</td><td>DO NOT tell Jay</td><td className="dim">exasperated, close</td></tr>
                  <tr><td className="edge">Jay</td><td>tell me what</td><td className="dim">wakes up, startled</td></tr>
                  <tr><td className="edge">Mina</td><td>...</td><td className="dim">looks down, 0.9 s</td></tr>
                </tbody>
              </table>
            )}
            {step === 3 && (
              <div className="frag-out">
                <p>
                  <b>{speaker}</b> says it {EMOTION_WORDS[d.emotion]}
                  {d.gesture !== "none" ? `, with a ${d.gesture.replace("_", " ")}` : ""}
                  {d.camera === "close" ? ", and the camera moves in." : "."}
                </p>
                <ul>
                  {(d.reactions ?? [])
                    .filter((r) => r.member_id !== who)
                    .map((r) => (
                      <li key={r.member_id}>
                        {FRIENDS.find((f) => f.id === r.member_id)!.name} {POSE_WORDS[r.pose]}
                        {r.pose === "surprised" ? " (their name came up)" : ""}
                      </li>
                    ))}
                </ul>
                {said && <span className="edge">Performed on the table above</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* the close-ups: what you make */}
      {YOURS.map((y, i) => (
        <section className={`lp-close c${i}`} id={i === 0 ? "yours" : undefined} key={y.id} aria-labelledby={`close-${y.id}`}>
          <img className="close-pic" src={y.pic} width={2400} height={1350} alt={y.picAlt} loading="lazy" />
          <div className="close-card rise">
            <h2 id={`close-${y.id}`}>{y.name}</h2>
            <p className="close-line">{y.line}</p>
            <p className="close-fact">{y.fact}</p>
            <img className="close-small" src={y.small} width={600} height={400} alt={y.smallAlt} loading="lazy" />
            <a className="lp-btn close-act" href="/home">{y.act}</a>
          </div>
        </section>
      ))}

      {/* the small things, stepping past the clay doors every chat opens through */}
      <section className="lp-doors" aria-labelledby="doors-h">
        <div className="doors-stage">
          <img className="doors-pic" src="/set/doors.webp" width={1200} height={2400} alt="The clay double doors every chat opens through, light showing between them" loading="lazy" />
          <div className="doors-scrim" />
          <ol className="doors-list">
            <li className={detail === -1 ? "on" : ""}>
              <h2 id="doors-h">The small things that make it a scene</h2>
            </li>
            {DETAILS.map((t, i) => (
              <li className={detail === i ? "on" : ""} key={i}>{t.say}</li>
            ))}
          </ol>
          {DETAILS.map((t, i) => (
            <div className={`doors-pics p${i}${detail === i ? " on" : ""}`} key={i} aria-hidden={detail !== i}>
              {t.pics.map((p, j) => (
                <img key={j} className={`dp dp${j}${p.cut ? " cut" : ""}`} src={p.src} width={400} height={400} alt={p.alt} loading="lazy" />
              ))}
              {t.receipt && (
                <table className="dp dp1 receipt" data-ui>
                  <caption className="edge">Receipt · one performance</caption>
                  <tbody>
                    <tr><td>Spark directs 12 lines</td><td className="n">$0.017</td></tr>
                    <tr><td>Voice Transcribe, 3 checks</td><td className="n">$0.002</td></tr>
                    <tr><td>Six outfits drawn on you</td><td className="n">$0.060</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
        <div className="doors-marks" aria-hidden="true">
          {DETAILS.map((_, i) => (
            <i key={i} data-detail={i} />
          ))}
        </div>
      </section>

      {/* which model does what */}
      <section id="models" className="lp-models">
        <table className="models">
          <thead>
            <tr className="part">
              <th colSpan={4} scope="colgroup"><h2 className="rise">Which Meta model does what</h2></th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((m) => (
              <tr key={m[0]} className="rise">
                <th scope="row">{m[0]}</th>
                <td>{m[1]}</td>
                <td>{m[2]}</td>
                <td className="n">{m[3]}</td>
              </tr>
            ))}
            <tr className="part">
              <th colSpan={4} scope="colgroup"><h3 className="rise">Outside Meta, each one replaceable</h3></th>
            </tr>
            {OUTSIDE.map((m) => (
              <tr key={m[0]} className="rise">
                <th scope="row">{m[0]}</th>
                <td>{m[1]}</td>
                <td>{m[2]}</td>
                <td className="n">{m[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* the close: the table, and a chair */}
      <section className="lp-cta" aria-labelledby="cta-h">
        <img className="cta-pic" src="/landing/table-close.webp" width={1600} height={1600} alt="Sam, Mina and Jay at the clay table with a birthday cake, Jay asleep" loading="lazy" />
        <div className="cta-text">
          <h2 id="cta-h" className="rise">Pull up a chair.</h2>
          <p className="rise">
            Make yourself once: a name, your voice, a figure. The demo chat is waiting at the table, and a second browser
            can be your first friend.
          </p>
          <a className="lp-btn rise" href="/home">Open Scene</a>
        </div>
      </section>

      <footer className="lp-foot">
        <p className="foot-name" aria-hidden="true">Scene</p>
        <div className="foot-row">
          <div className="foot-left">
            <ul className="foot-places">
              <li><a href="/home">Open the app</a></li>
              <li><a href={LIVE}>scene-lovat.vercel.app</a></li>
            </ul>
            <p className="foot-disc">
              <b>Built before and during the hackathon.</b> I prototyped this idea before the Meta AI Developer Hackathon
              2026: <a href={PRIOR}>Scene</a>, created Oct 24, 2026, a 3D motion-engine prototype with r3f avatars and a
              voice-clone experiment; that repository stays public. This repository was started on Nov 3, 2026 (first commit
              09:35 KST; published to GitHub on Nov 4) and reuses none of its code or assets. Everything here, the figure
              pipeline (Muse Image, SAM 3.1, SAM 3D), the Spark director and its validator, the Voice Transcribe checks, the
              3D table stage, the chat backend and the web app, was written Nov 3–5, 2026. What carried over is the idea:
              chat performed by your friends in their own voices.
            </p>
          </div>
          <div className="foot-run" id="run">
            <h2>Run it yourself</h2>
            <p>One key, no login. The demo sculpts the cast, has Spark direct the table and writes the replay with its receipt.</p>
            <pre><code>{`cp .env.example .env
# add your META_API_KEY to .env
npm install
npm test
npm run demo -- --voice none`}</code></pre>
          </div>
        </div>
        <div className="foot-last">
          <p>Built for the Meta AI Developer Hackathon 2026. Voices: OpenAI gpt-4o-mini-tts or self-hosted Qwen3-TTS, checked by Meta&apos;s models.</p>
          <a className="foot-top" href="#">Back to the top</a>
        </div>
      </footer>
    </div>
  );
}
