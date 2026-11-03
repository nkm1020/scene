// Stage CSS as a string so the same look ships in the web app and in the self-contained replay.html.

export const STAGE_CSS = String.raw`
.sc-stage{--holo:#7fe3ff;--holo-2:#3aa8ff;--bg:#05070f;--ink:#e9f6ff;--dim:#8aa3bf;
  position:relative;width:100%;height:100%;min-height:420px;overflow:hidden;background:var(--bg);
  font-family:ui-sans-serif,system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:var(--ink);
  user-select:none;-webkit-user-select:none;isolation:isolate}
.sc-room{position:absolute;inset:0;pointer-events:none;
  background:
   radial-gradient(120% 70% at 50% 108%,rgba(58,168,255,.22),transparent 60%),
   radial-gradient(80% 50% at 50% 0%,rgba(127,227,255,.07),transparent 70%),
   linear-gradient(#060a18,#03050b)}
.sc-floor{position:absolute;left:-30%;right:-30%;bottom:-8%;height:58%;pointer-events:none;
  background-image:linear-gradient(rgba(127,227,255,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(127,227,255,.10) 1px,transparent 1px);
  background-size:56px 56px;transform:perspective(520px) rotateX(64deg);transform-origin:50% 100%;
  mask-image:linear-gradient(transparent,#000 35%,#000 70%,transparent);-webkit-mask-image:linear-gradient(transparent,#000 35%,#000 70%,transparent)}
.sc-table{position:absolute;left:50%;top:var(--table-y,62%);width:88%;height:var(--table-h,22%);transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;z-index:8;
  background:radial-gradient(60% 60% at 50% 40%,rgba(18,46,84,.96),rgba(6,14,32,.97) 70%,rgba(4,9,22,.98));
  box-shadow:0 0 0 1.5px rgba(127,227,255,.55) inset,0 -2px 18px rgba(127,227,255,.35),0 18px 50px rgba(0,0,0,.7)}
.sc-table::after{content:"";position:absolute;inset:18% 22%;border-radius:50%;border:1px solid rgba(127,227,255,.18);box-shadow:0 0 30px rgba(58,168,255,.18) inset}
.sc-cam{position:absolute;inset:0;transition:transform .9s cubic-bezier(.2,.7,.2,1);transform-origin:50% 60%}
.sc-seat{position:absolute;transform:translate(-50%,-100%);transition:transform .6s cubic-bezier(.2,.7,.2,1),filter .6s,opacity .6s;will-change:transform}
.sc-persona{position:relative;transform-origin:50% 100%;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.sc-body,.sc-head{position:relative;display:block;width:100%;height:auto}
.sc-layer{position:relative}
.sc-layer.head{position:absolute;inset:0;transform-origin:50% 60%;transition:transform .6s cubic-bezier(.3,.8,.3,1)}
.sc-img{display:block;width:100%;height:auto;opacity:.9;
  filter:drop-shadow(0 0 1.5px rgba(127,227,255,.95)) drop-shadow(0 0 10px rgba(58,168,255,.55)) saturate(.92) brightness(1.06)}
.sc-layer.body .sc-img{clip-path:inset(56% 0 0 0)}
.sc-layer.head .sc-img{clip-path:inset(0 0 40% 0)}
.sc-scan{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:.55;
  background:repeating-linear-gradient(0deg,rgba(127,227,255,.22) 0 1px,transparent 1px 4px),linear-gradient(180deg,rgba(127,227,255,.18),rgba(58,168,255,.05));
  -webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
.sc-layer.body .sc-scan{clip-path:inset(56% 0 0 0)}
.sc-layer.head .sc-scan{clip-path:inset(0 0 40% 0);animation:sc-scroll 3.2s linear infinite}
@keyframes sc-scroll{to{background-position:0 40px,0 0}}
.sc-disc{position:absolute;left:50%;bottom:-6%;width:86%;aspect-ratio:4/1;transform:translateX(-50%);border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(127,227,255,.55),rgba(58,168,255,.18) 60%,transparent);filter:blur(.5px);transition:opacity .6s}
.sc-beam{position:absolute;left:8%;right:8%;bottom:2%;height:92%;pointer-events:none;opacity:.22;transition:opacity .6s;
  background:linear-gradient(0deg,rgba(127,227,255,.5),transparent 85%);clip-path:polygon(18% 100%,82% 100%,100% 0,0 0)}
.sc-name{position:absolute;left:50%;top:-11%;transform:translateX(-50%);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);white-space:nowrap;transition:color .4s,opacity .4s}
.sc-flicker{animation:sc-flicker 2.7s steps(1) infinite}
@keyframes sc-flicker{0%,100%{opacity:1}31%{opacity:.86}32%{opacity:1}63%{opacity:.93}64%{opacity:1}}
/* presence: absent = bowed pose (Muse Image edit) or a tilted head (fallback) + dim */
.sc-pose{transition:opacity .6s ease}
.sc-pose.away{position:absolute;left:0;right:0;bottom:0;opacity:0}
.sc-pose.away .sc-img{width:100%;height:auto}
.sc-seat.has-away.absent .sc-pose.here{opacity:0}
.sc-seat.has-away.absent .sc-pose.away{opacity:1}
.sc-seat.has-away.absent .sc-layer.head{transform:none}
.sc-seat.absent .sc-layer.head{transform:perspective(500px) translateY(9%) rotateX(-38deg)}
.sc-seat.absent{filter:brightness(.42) saturate(.6)}
.sc-seat.absent .sc-disc{opacity:.25}.sc-seat.absent .sc-beam{opacity:.06}
.sc-seat.absent .sc-persona{animation:none}
.sc-seat.present .sc-persona{animation:sc-idle 4.5s ease-in-out infinite}
@keyframes sc-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.2%)}}
/* speaking */
.sc-seat.speaking{filter:brightness(1.18);z-index:5}
.sc-seat.speaking .sc-beam{opacity:.5}.sc-seat.speaking .sc-disc{opacity:1}
.sc-seat.speaking .sc-name{color:var(--holo)}
.sc-seat.dimmed{filter:brightness(.55) saturate(.8)}
.sc-seat.dimmed.absent{filter:brightness(.32) saturate(.5)}
.sc-seat.waiting .sc-persona{animation:sc-breathe 1.6s ease-in-out infinite}
@keyframes sc-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,1.028)}}
.sc-dots{position:absolute;left:50%;top:-8%;transform:translateX(-50%);font-size:22px;letter-spacing:2px;color:var(--holo);opacity:0;transition:opacity .3s;text-shadow:0 0 8px var(--holo-2)}
.sc-seat.waiting .sc-dots{opacity:1;animation:sc-dots 1.2s steps(4) infinite}
@keyframes sc-dots{0%{clip-path:inset(0 100% 0 0)}100%{clip-path:inset(0 -10% 0 0)}}
/* emotes */
.sc-emote{position:absolute;right:-6%;top:-4%;width:34%;aspect-ratio:1;opacity:0;transform:scale(.6) rotate(-8deg);transition:opacity .25s,transform .35s cubic-bezier(.3,1.6,.5,1);pointer-events:none;filter:drop-shadow(0 0 6px rgba(127,227,255,.8))}
.sc-emote.on{opacity:1;transform:scale(1) rotate(0)}
.sc-emote svg{width:100%;height:100%;overflow:visible}
.emo-happy .sc-persona{animation:sc-bounce .7s ease-in-out 2}
.emo-laughing .sc-persona{animation:sc-bounce .32s ease-in-out 6}
.emo-surprised .sc-persona{animation:sc-jump .5s cubic-bezier(.2,1.4,.4,1) 1}
.emo-angry .sc-persona{animation:sc-shake .12s linear 8}
.emo-sad .sc-layer.head{transform:perspective(500px) translateY(4%) rotateX(-16deg)}
@keyframes sc-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4%)}}
@keyframes sc-jump{0%{transform:translateY(0) scale(1)}40%{transform:translateY(-7%) scale(1.04)}100%{transform:translateY(0) scale(1)}}
@keyframes sc-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2.2%) rotate(-1deg)}75%{transform:translateX(2.2%) rotate(1deg)}}
/* gestures (applied on the seat wrapper offset) */
.g-nod .sc-layer.head{animation:sc-nod .5s ease-in-out 2}
@keyframes sc-nod{0%,100%{transform:perspective(500px) rotateX(0)}50%{transform:perspective(500px) translateY(3%) rotateX(-18deg)}}
.g-shake .sc-layer.head{animation:sc-headshake .35s ease-in-out 3}
@keyframes sc-headshake{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
/* self mirror (bottom-left): visible only while your own line plays */
.sc-seat.self{z-index:22;opacity:0;transition:opacity .35s ease;pointer-events:none}
.sc-seat.self.speaking{opacity:1}
.sc-seat.self .sc-name{top:auto;bottom:-14%;font-size:9px;letter-spacing:.08em;color:var(--holo)}
.sc-seat.self .sc-layer.head{transform:none}
/* caption */
.sc-caption{position:absolute;left:50%;bottom:4.5%;transform:translateX(-50%);width:min(92%,640px);text-align:center;pointer-events:none;z-index:20}
.sc-caption .who{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--holo);opacity:.9;margin-bottom:6px}
.sc-caption .line{display:inline-block;font-size:clamp(17px,3.6vw,24px);line-height:1.35;font-weight:600;padding:8px 14px;border-radius:12px;
  background:rgba(3,8,20,.62);border:1px solid rgba(127,227,255,.28);box-shadow:0 0 24px rgba(58,168,255,.18);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.sc-caption .flag{display:block;margin-top:6px;font-size:11px;color:#ffcf7a;letter-spacing:.04em}
.sc-caption.hidden{opacity:0;transition:opacity .4s}
.sc-mark{position:absolute;top:10px;right:12px;font-size:10px;letter-spacing:.18em;color:rgba(233,246,255,.55);border:1px solid rgba(233,246,255,.25);padding:3px 7px;border-radius:999px;z-index:30;pointer-events:none}
.sc-scanall{position:absolute;inset:0;pointer-events:none;z-index:25;opacity:.08;background:repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 3px)}
.sc-vignette{position:absolute;inset:0;pointer-events:none;z-index:24;background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(0,0,0,.65))}
@media (prefers-reduced-motion:reduce){.sc-stage *{animation:none!important;transition:none!important}}
`;
