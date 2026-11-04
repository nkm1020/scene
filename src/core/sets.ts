// Room sets. A room is four walls, a floor and a tabletop, each one Muse Image photograph in the cast's clay look.
// Three are ready-made (scripts/make-themes.ts); any other is said in words: Spark turns the words into a set spec,
// validateSetSpec checks it (fixed checkpoint), and Muse Image paints the six surfaces in parallel.

import sharp from "sharp";
import { generateImage, sparkJSON } from "./meta";
import type { Ledger } from "./ledger";

export interface SetSpec {
  place: string; // "a cozy dining room"
  wall: string; // what every wall is made of
  front: string; // what hangs or stands on each wall
  left: string;
  right: string;
  back: string;
  floor: string;
  tabletop: string;
}

export const SET_PARTS = ["wall-front", "wall-left", "wall-right", "wall-back", "floor", "tabletop"] as const;
export type SetPart = (typeof SET_PARTS)[number];

/** What a room stores in rooms.set: a ready-made theme, or its own painted surfaces. */
export type RoomSet = { theme: string } | { said: string; spec: SetSpec; urls: Partial<Record<SetPart, string>> };

export const SET_THEMES: Record<string, { label: string; spec: SetSpec }> = {
  dining: {
    label: "Dining room",
    spec: {
      place: "a cozy dining room",
      wall: "plain muted sage-green plaster wall with only a faint hand-pressed texture and no pattern, above simple dark walnut wainscot boards",
      front: "one small framed landscape painting hanging slightly left of the middle",
      left: "one window in the middle with plain dark red curtains, showing a deep blue night sky",
      right: "one small round wall clock hanging right of the middle",
      back: "a plain wooden door in the middle",
      floor: "dark walnut-brown painted wood planks with a plain round dark rust rug in the exact center",
      tabletop: "a round walnut tabletop of painted wood and plasticine",
    },
  },
  cafe: {
    label: "Corner cafe",
    spec: {
      place: "a small corner cafe",
      wall: "warm mustard-yellow plaster wall above a band of glossy dark green square tiles",
      front: "one long wooden shelf with a few glass jars of coffee beans and two small potted plants",
      left: "one wide window in the middle with a red and white striped awning edge at its top, showing a sunny street with a tree",
      right: "two small round pendant lamps hanging from the top edge and a coat hook with a scarf",
      back: "a wooden door with a glass pane in the middle and a little bell above it",
      floor: "black and cream checkerboard tiles",
      tabletop: "a round pale marble cafe tabletop with a thin brass rim",
    },
  },
  rooftop: {
    label: "Rooftop at night",
    spec: {
      place: "a rooftop terrace at night",
      wall: "a low red-brick parapet along the bottom third, above it the deep navy night sky with a few stars",
      front: "a distant city skyline of small lit windows beyond the parapet and a string of warm round bulbs hanging across the top",
      left: "a big round pale moon low in the sky and the string of warm bulbs continuing across the top",
      right: "a water tower on stilts beyond the parapet and the string of warm bulbs",
      back: "a small brick stair hut with a lit wooden door in the middle",
      floor: "weathered pale wooden deck boards with a striped outdoor rug in the center",
      tabletop: "a round weathered wooden picnic tabletop with a checked cloth napkin",
    },
  },
};

const CLAY =
  "Everything is handmade from plasticine and painted wood with faint fingerprints and visible sculpting marks, a stop-motion film set, warm soft even lighting, no people, no text.";

export function setPartPrompt(spec: SetSpec, part: SetPart): { prompt: string; size?: string } {
  if (part === "floor")
    return { prompt: `Top-down photo looking straight down at the floor of ${spec.place}: ${spec.floor}, filling the frame. ${CLAY}` };
  if (part === "tabletop")
    return { prompt: `Top-down photo looking straight down at ${spec.tabletop}, the table fills the frame edge to edge, nothing on it. ${CLAY}` };
  const content = spec[part.slice(5) as "front" | "left" | "right" | "back"];
  return {
    size: "2048x1024",
    prompt: `Claymation miniature set: one wall of ${spec.place}, photographed straight on, the wall fills the whole frame from the top edge down to the bottom edge, no floor and no ceiling visible: ${spec.wall}; ${content}. Calm, simple and uncluttered, mostly empty wall. ${CLAY}`,
  };
}

/** Paint the six surfaces in parallel. Returns WebP buffers sized like the dining set. */
export async function drawSet(spec: SetSpec, opts: { ledger?: Ledger; parts?: SetPart[] } = {}): Promise<Record<SetPart, Buffer>> {
  const parts = opts.parts ?? [...SET_PARTS];
  const out = await Promise.all(
    parts.map(async (part) => {
      const { prompt, size } = setPartPrompt(spec, part);
      const img = await generateImage(prompt, { size, format: "png", op: "set.draw", ledger: opts.ledger });
      const webp = await sharp(img.bytes)
        .resize({ width: part.startsWith("wall") ? 2048 : 1600 })
        .webp({ quality: 84 })
        .toBuffer();
      return [part, webp] as const;
    }),
  );
  return Object.fromEntries(out) as Record<SetPart, Buffer>;
}

// ───────── said rooms: Spark plans the set, the validator checks it ─────────

const FIELDS = ["place", "wall", "front", "left", "right", "back", "floor", "tabletop"] as const;
const BANNED = /\b(person|people|man|woman|child|boy|girl|face|text|word|words|letter|letters|logo|sign|brand|nude|naked|blood|gun|weapon)s?\b/i;

export const SET_SCHEMA = {
  name: "room_set",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [...FIELDS],
    properties: Object.fromEntries(FIELDS.map((f) => [f, { type: "string" }])),
  },
};

export interface SetCheck {
  ok: boolean;
  errors: string[];
  spec: SetSpec | null;
}

/** Fixed checkpoint: every field present, short, in English plain words, and nothing that would paint a person or writing. */
export function validateSetSpec(raw: unknown): SetCheck {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["S1 not an object"], spec: null };
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!(FIELDS as readonly string[]).includes(k)) errors.push(`S1 unexpected key "${k}"`);
  for (const f of FIELDS) {
    const v = o[f];
    if (typeof v !== "string" || !v.trim()) {
      errors.push(`S1 "${f}" is missing`);
      continue;
    }
    const max = f === "place" ? 60 : 220;
    if (v.length > max) errors.push(`S2 "${f}" is ${v.length} characters, max ${max}`);
    if (BANNED.test(v)) errors.push(`S3 "${f}" mentions people or writing ("${v.match(BANNED)![0]}"); the set has neither`);
    if (/[^\x20-\x7E]/.test(v)) errors.push(`S4 "${f}" is not plain English`);
  }
  if (errors.length) return { ok: false, errors, spec: null };
  return { ok: true, errors, spec: Object.fromEntries(FIELDS.map((f) => [f, String(o[f]).trim()])) as unknown as SetSpec };
}

const PLAN_PROMPT = `You design the miniature clay set for a group chat's room. The friends sit at a round table in the middle of a square room.
From the user's words (any language), describe the room in plain English for an image model, one short phrase per field:
- place: what kind of place, e.g. "a beach hut at sunset"
- wall: what every wall is made of and its colour (the same for all four walls)
- front, left, right, back: one or two things on that wall (a window and its view, a shelf, a lamp, a door on the back wall)
- floor: the floor seen from above, optionally with a rug
- tabletop: the round tabletop seen from above (material and colour)
Keep it calm and uncluttered. Never include people, faces, animals with faces, text, letters, signs or logos.`;

export async function planSet(words: string, opts: { ledger?: Ledger } = {}) {
  const log: { ok: boolean; errors: string[]; ms: number }[] = [];
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await sparkJSON(
      [
        { role: "system", content: PLAN_PROMPT },
        { role: "user", content: `The room: ${words.slice(0, 200)}${feedback}` },
      ],
      SET_SCHEMA,
      { reasoningEffort: "minimal", maxTokens: 1200, op: "set.plan", ledger: opts.ledger },
    );
    const check = validateSetSpec(res.data);
    log.push({ ok: check.ok, errors: check.errors, ms: res.ms });
    if (check.ok) return { spec: check.spec!, log };
    feedback = `\n\nYour last answer failed these checks, fix them: ${check.errors.join("; ")}`;
  }
  return { spec: null, log };
}
