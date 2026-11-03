"use client";
// Silent, looping preview of the seed room on the landing page (rule-table directions, no API calls).
import { useEffect, useRef } from "react";
import { createStage, type PerformItem } from "@/stage/engine";
import { SEED_MEMBERS, SEED_MESSAGES } from "@/core/seed";
import { ruleDirections } from "@/core/director";
import { isSilent } from "@/core/text";

export default function HeroStage() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const stage = createStage(host.current, {
      members: SEED_MEMBERS.map((m) => ({ id: m.id, name: m.name, personaUrl: `/seed/${m.id}.webp`, awayUrl: `/seed/${m.id}-away.webp`, present: m.id !== "jay" })),
      viewerId: null,
      quiet: true,
    });
    const dirs = ruleDirections(SEED_MESSAGES);
    const items: PerformItem[] = SEED_MESSAGES.map((m, i) => ({
      messageId: m.id,
      memberId: m.sender_id,
      text: m.text,
      emotion: dirs[i].emotion,
      gesture: dirs[i].gesture,
      camera: dirs[i].camera,
      pauseMs: dirs[i].pause_ms + 250,
      status: isSilent(m.text) ? "silent" : "captions_only",
    }));
    let alive = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 1200));
      while (alive) {
        await stage.play(items, {}).done;
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();
    return () => {
      alive = false;
      stage.destroy();
    };
  }, []);
  return <div className="hero-stage" ref={host} aria-label="Preview: three friends performing a group chat as holograms" />;
}
