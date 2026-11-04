"use client";
// Lab: the seed room on the 3D stage, rule-table directions with simple listener reactions (no API calls).
import { useEffect, useRef, useState } from "react";
import { createStage, type PerformItem } from "@/stage3d/engine";
import { SEED_MESSAGES } from "@/core/seed";
import { ruleDirections } from "@/core/rules";
import { isSilent } from "@/core/text";
import { SEED_STAGE_MEMBERS } from "@/client/seedFigures";

export default function Lab() {
  const host = useRef<HTMLDivElement>(null);
  const [glb, setGlb] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const stage = createStage(host.current, { members: SEED_STAGE_MEMBERS(glb), viewerId: null });
    const dirs = ruleDirections(SEED_MESSAGES, SEED_STAGE_MEMBERS(false).map((m) => ({ member_id: m.id, name: m.name, present: m.present })));
    const ids = ["sam", "mina", "jay"];
    const items: PerformItem[] = SEED_MESSAGES.map((m, i) => ({
      messageId: m.id,
      memberId: m.sender_id,
      text: m.text,
      emotion: dirs[i].emotion,
      gesture: dirs[i].gesture,
      camera: dirs[i].camera,
      to: dirs[i].to,
      pauseMs: dirs[i].pause_ms + 300,
      status: isSilent(m.text) ? "silent" : "captions_only",
      flags: ["voice_disabled"],
      reactions: ids.filter((x) => x !== m.sender_id).map((x, k) => ({ memberId: x, pose: (["laughing", "surprised", "happy", "sad"] as const)[(i + k) % 4], look: "speaker" as const })),
    }));
    let alive = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 1500));
      while (alive) {
        await stage.play(items, {}).done;
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    (window as any).__stage = stage;
    return () => {
      alive = false;
      stage.destroy();
    };
  }, [glb]);
  return (
    <main style={{ height: "100dvh", display: "grid", gridTemplateRows: "1fr auto" }}>
      <div ref={host} style={{ position: "relative", minHeight: 0 }} />
      <button onClick={() => setGlb((g) => !g)} style={{ padding: 12 }}>
        {glb ? "Using GLB meshes" : "Using cut-out cards"} (toggle)
      </button>
    </main>
  );
}
