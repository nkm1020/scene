"use client";
// Landing hero: the seed room performing on the 3D table, silent, looping (rule directions; no API calls).
import { useEffect, useRef } from "react";
import { createStage, type PerformItem } from "@/stage3d/engine";
import { SEED_MESSAGES } from "@/core/seed";
import { ruleDirections } from "@/core/rules";
import { isSilent } from "@/core/text";
import { SEED_STAGE_MEMBERS } from "./seedFigures";

export default function HeroStage() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    let stage: ReturnType<typeof createStage> | null = null;
    (async () => {
      const hasGlb = await fetch("/seed/figures/sam/neutral.glb", { method: "HEAD" }).then((r) => r.ok).catch(() => false);
      if (!alive || !host.current) return;
      const members = SEED_STAGE_MEMBERS(hasGlb);
      stage = createStage(host.current, { members, viewerId: null, quiet: true });
      const roster = members.map((m) => ({ member_id: m.id, name: m.name, present: m.present }));
      const dirs = ruleDirections(SEED_MESSAGES, roster);
      const items: PerformItem[] = SEED_MESSAGES.map((m, i) => ({
        messageId: m.id,
        memberId: m.sender_id,
        text: m.text,
        emotion: dirs[i].emotion,
        gesture: dirs[i].gesture,
        camera: dirs[i].camera,
        pauseMs: dirs[i].pause_ms + 250,
        status: isSilent(m.text) ? "silent" : "captions_only",
        reactions: (dirs[i].reactions ?? []).map((r) => ({ memberId: r.member_id, pose: r.pose, look: r.look })),
      }));
      await new Promise((r) => setTimeout(r, 1200));
      while (alive && stage) {
        await stage.play(items, {}).done;
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => {
      alive = false;
      stage?.destroy();
    };
  }, []);
  return <div className="hero-stage" ref={host} aria-label="Seen from your seat: three friends as clay figurines around a table, performing a group chat" />;
}
