"use client";
// The landing page's fixed half: the seed room at its table, performing the group chat on a loop (rule directions,
// captions only, no API calls). The page can jump it to a line, or hand it a line you typed to perform.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createStage, type PerformItem, type Stage } from "@/stage3d/engine";
import { SEED_MESSAGES } from "@/core/seed";
import { ruleDirection, ruleDirections } from "@/core/rules";
import { isSilent } from "@/core/text";
import { SEED_STAGE_MEMBERS } from "./seedFigures";

export interface LandingStageHandle {
  playFrom(index: number): void;
  say(memberId: string, text: string): void;
}

const roster = () => SEED_STAGE_MEMBERS(false).map((m) => ({ member_id: m.id, name: m.name, present: m.present }));

function toItem(id: string, memberId: string, text: string, d: ReturnType<typeof ruleDirection>): PerformItem {
  return {
    messageId: id,
    memberId,
    text,
    emotion: d.emotion,
    gesture: d.gesture,
    camera: d.camera,
    to: d.to,
    pauseMs: d.pause_ms + 250,
    status: isSilent(text) ? "silent" : "verified",
    reactions: (d.reactions ?? []).map((r) => ({ memberId: r.member_id, pose: r.pose, look: r.look })),
  };
}

const LandingStage = forwardRef<LandingStageHandle>(function LandingStage(_, ref) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const loop = useRef<{ from: number; token: number }>({ from: 0, token: 0 });
  const items = useRef<PerformItem[]>([]);

  const run = async (from: number) => {
    const token = ++loop.current.token;
    let start = from;
    while (stage.current && loop.current.token === token) {
      await stage.current.play(items.current, { startIndex: start }).done;
      start = 0;
      if (loop.current.token !== token) return;
      await new Promise((r) => setTimeout(r, 2500));
    }
  };

  useImperativeHandle(ref, () => ({
    playFrom(index: number) {
      void run(index);
    },
    say(memberId: string, text: string) {
      if (!stage.current) return;
      const token = ++loop.current.token;
      const d = ruleDirection({ id: "typed", sender_id: memberId, sender_name: memberId, text }, roster());
      void stage.current.play([toItem(`typed-${Date.now()}`, memberId, text, d)], {}).done.then(() => {
        if (loop.current.token === token) setTimeout(() => loop.current.token === token && void run(0), 2200);
      });
    },
  }));

  useEffect(() => {
    if (!host.current) return;
    const members = SEED_STAGE_MEMBERS(false);
    stage.current = createStage(host.current, { members, viewerId: null, quiet: true });
    const dirs = ruleDirections(SEED_MESSAGES, roster());
    // the landing loop leaves emoji out of the lines (the room itself performs them)
    items.current = SEED_MESSAGES.map((m, i) => toItem(m.id, m.sender_id, m.text.replace(/\p{Extended_Pictographic}/gu, "").trim(), dirs[i])).filter((it) => it.text);
    const t = setTimeout(() => void run(0), 1200);
    return () => {
      clearTimeout(t);
      loop.current.token++;
      stage.current?.destroy();
      stage.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="land-stage-host" ref={host} aria-label="Seen from your seat: Sam, Mina and Jay as clay figures around a table, acting out their group chat" />;
});

export default LandingStage;
