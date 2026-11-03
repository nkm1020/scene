# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (mobile-first: phones in portrait are the main screen; desktop shows the same room)

## Stack

Next.js 15 + React, three.js stage (`src/stage3d`), Supabase for rooms and sync, Meta Model API (OpenAI-SDK compatible, `https://api.meta.ai/v1`, Standard tier).

## What it is

Scene is a group chat with a new layout. A small group of friends (3–5 people) chats as usual: create a room, add friends, send text or hold-to-talk messages. Instead of a list of bubbles, the room is a miniature stop-motion dining table seen from your own seat. Each friend is a clay figure. When a message arrives, its sender's figure says it in that friend's own registered voice and the others react. Missed messages replay as a directed scene.

## Users and jobs

- **Primary user:** someone in a small friends' group chat who wants to feel the group's presence instead of reading a list, and catch up on what they missed.
- **Judges (Meta AI Developer Hackathon 2026):** run the real app alone, with no login and no real friends. They must be able to use the basic chat functions for real (create a room, add friends, send messages) and see the new layout perform them.
- **Demo friends:** for solo use, the room offers friends played by Spark through the OpenAI-compatible Meta API. They are framed as friends the maker recruited, each with their own registered voice. They chat back, and their replies are performed like any friend's message.

## Mechanism (what must stay true)

- Every voiced line is read back by **Muse Voice Transcribe** and plays only if it matches the message exactly. "It says what you said, nothing else."
- **Muse Spark** directs the table: expressions, where each figure looks, reactions, camera, pauses. Its output carries no text field; a deterministic validator checks it first.
- **Muse Image** makes the figures (and SAM 3.1 separates them). Muse stays core to how a figure is made. A figure's face never changes once made: customization works like an avatar builder (swap hair, outfit, accessories), and only the chosen part changes.
- Voice: friends speak in their own registered voice (consent checked by Voice Transcribe on a read-aloud). Meta has no TTS; an external TTS (Qwen3-TTS, self-hosted) speaks, and Meta models check it.
- Message audio is not stored; personal-data calls use the Standard tier only.

## Constraints

- Deadline 2026-11-05 11:00 KST. Demo scope: limited catalogs are fine; it does not need to be complete.
- Judged on a 3-minute video and the public repo; Meta may run it with its own key. One key, one command, no login.
- Meta-hosted models are the core; external services are supporting only. No Muse Wonder (not available in Korea), no Spark Open.
- Prior work must be disclosed in the README first line and the video's first seconds.

## Open decisions

- How "less 2D" the figures can get within the deadline while staying Muse-made (layered parts, depth, SAM 3D meshes when a fal.ai key exists).
