// Your figure's lookbook: change hair, outfit or an extra the way an avatar builder does, and the face never changes.
//   Muse Image edits the whole figure (it keeps the pose, the framing and mostly the face),
//   SAM 3.1 found the face once, on the figure you chose, and code pastes that exact face back onto every edit.
//   Extras that sit on the face (glasses, a hat brim) are cut out by SAM 3.1 and kept on top of the face.
import sharp from "sharp";
import { editImage, segment, sparkJSON } from "./meta";
import { unionAlpha } from "./persona";
import type { Ledger } from "./ledger";

export type LookPart = "hair" | "outfit" | "extra";

export interface LookOption {
  id: string;
  part: LookPart;
  label: string;
  /** what changes, said to Muse Image as an edit */
  change: string;
  /** SAM 3.1 phrase for an extra that covers part of the face; it stays on top of the locked face */
  overFace?: string;
}

export const LOOKBOOK: LookOption[] = [
  { id: "hair-messy", part: "hair", label: "Short and messy", change: "the hair is short, messy and black" },
  { id: "hair-waves", part: "hair", label: "Long waves", change: "the hair is long, wavy and chestnut brown" },
  { id: "hair-ponytail", part: "hair", label: "Pink ponytail", change: "the hair is pulled up into a high pink ponytail" },
  { id: "hair-buzz", part: "hair", label: "Bleached buzz", change: "the hair is a short bleached blond buzz cut" },
  { id: "hair-bob", part: "hair", label: "Red curls", change: "the hair is a curly red bob" },
  { id: "hair-buns", part: "hair", label: "Space buns", change: "the hair is dark brown, in two round space buns on top" },
  { id: "outfit-hoodie", part: "outfit", label: "Green hoodie", change: "the top is an oversized green hoodie" },
  { id: "outfit-varsity", part: "outfit", label: "Varsity jacket", change: "the top is a red varsity jacket over a white t-shirt" },
  { id: "outfit-cardigan", part: "outfit", label: "Yellow cardigan", change: "the top is a chunky yellow knitted cardigan" },
  { id: "outfit-turtleneck", part: "outfit", label: "Black turtleneck", change: "the top is a fitted black turtleneck" },
  { id: "outfit-stripes", part: "outfit", label: "Striped tee", change: "the top is a navy and white striped t-shirt" },
  { id: "outfit-denim", part: "outfit", label: "Denim jacket", change: "the top is a light blue denim jacket over a white t-shirt" },
  { id: "extra-none", part: "extra", label: "Nothing", change: "no glasses, no hat and no accessories at all" },
  { id: "extra-glasses", part: "extra", label: "Round glasses", change: "add round black glasses", overFace: "glasses" },
  { id: "extra-beanie", part: "extra", label: "Red beanie", change: "add a red knit beanie on the head", overFace: "hat" },
  { id: "extra-headphones", part: "extra", label: "Headphones", change: "add big headphones resting around the neck" },
  { id: "extra-bucket", part: "extra", label: "Bucket hat", change: "add a yellow bucket hat on the head", overFace: "hat" },
  { id: "extra-scarf", part: "extra", label: "Striped scarf", change: "add a red and cream striped scarf around the neck" },
];

const KEEP = "Same character, same face, same clay style, same stool, same pose, same framing, same plain light gray background and lighting. Change only this:";

export function lookEditPrompt(change: string): string {
  return `${KEEP} ${change}.`;
}

/** SAM 3.1 mask of one phrase as a full-frame 0..255 alpha (empty when nothing is found). */
export async function phraseMask(image: Buffer, phrase: string, opts: { ledger?: Ledger } = {}) {
  const { width, height } = await sharp(image).metadata();
  const r = await segment(image, "image/png", phrase, { op: `look.${phrase}`, ledger: opts.ledger });
  return { alpha: await unionAlpha(r.masks, width!, height!), width: width!, height: height! };
}

export async function maskPng(alpha: Uint8Array, width: number, height: number) {
  return sharp(Buffer.from(alpha), { raw: { width, height, channels: 1 } }).png().toBuffer();
}

export async function readMask(png: Buffer) {
  const { data, info } = await sharp(png).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return { alpha: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Paste the original face back onto an edit. `face` is the face mask of the figure you chose (0..255),
 * `over` an extra that belongs on top of the face (glasses, a hat brim); the paste skips it.
 */
export async function lockFace(original: Buffer, edited: Buffer, face: Uint8Array, over: Uint8Array | null) {
  const { width: W, height: H } = await sharp(original).metadata();
  const a = await sharp(original).removeAlpha().raw().toBuffer();
  const b = await sharp(edited).resize(W, H).removeAlpha().raw().toBuffer();
  const m = Buffer.alloc(W! * H!);
  for (let i = 0; i < m.length; i++) m[i] = over && over[i] > 64 ? 0 : face[i];
  // a soft edge so the seam does not show in the clay
  const soft = await sharp(m, { raw: { width: W!, height: H!, channels: 1 } }).blur(3).raw().toBuffer();
  const out = Buffer.alloc(b.length);
  for (let i = 0; i < W! * H!; i++) {
    const t = soft[i] / 255;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(b[i * 3 + c] * (1 - t) + a[i * 3 + c] * t);
  }
  return sharp(out, { raw: { width: W!, height: H!, channels: 3 } }).png().toBuffer();
}

/** One option on your figure: Muse edits it, the face is locked back. Returns the full PNG and a small tile. */
export async function renderLook(current: Buffer, original: Buffer, face: Uint8Array, change: string, overFace: string | undefined, opts: { ledger?: Ledger } = {}) {
  const edited = (await editImage([current], lookEditPrompt(change), { op: "look.edit", ledger: opts.ledger })).bytes;
  // one SAM 3.1 call per phrase ("glasses+hat" is two), unioned
  let over: Uint8Array | null = null;
  for (const phrase of overFace ? overFace.split("+") : []) {
    const m = (await phraseMask(edited, phrase, opts)).alpha;
    over = over ? over.map((v, i) => Math.max(v, m[i])) : m;
  }
  const png = await lockFace(original, edited, face, over);
  return { png, tile: await lookTile(png) };
}

/** A square tile of the head and shoulders for the option grid. */
export async function lookTile(png: Buffer) {
  const { width: W, height: H } = await sharp(png).metadata();
  const s = Math.round(W! * 0.56);
  return sharp(png)
    .extract({ left: Math.round((W! - s) / 2), top: Math.round(H! * 0.04), width: s, height: Math.min(s, H! - Math.round(H! * 0.04)) })
    .resize(320, 320)
    .webp({ quality: 82 })
    .toBuffer();
}

// ───────── say it: your words → one edit (Spark plans, the validator decides) ─────────

export interface SaidChange {
  part: LookPart;
  change: string;
  overFace: "glasses" | "hat" | "glasses+hat" | null;
}

const BANNED = /\b(logo|brand|text|letters?|words?|writing|nude|naked|blood|weapon|gun|knife|celebrity|famous)\b/i;

/** Deterministic gate: a known part, a short plain description of one change, nothing branded or unsafe. */
export function validateSaid(raw: unknown): SaidChange | null {
  const r = raw as any;
  const part = r?.part;
  if (part !== "hair" && part !== "outfit" && part !== "extra") return null;
  const change = String(r?.change ?? "").replace(/\s+/g, " ").trim();
  if (change.length < 4 || change.length > 90 || BANNED.test(change) || /[<>{}\[\]"]/.test(change)) return null;
  const overFace = ["glasses", "hat", "glasses+hat"].includes(r?.overFace) ? r.overFace : null;
  return { part, change, overFace };
}

/** Turn "빨간 비니 씌워줘" into one figure edit. Spark proposes; validateSaid decides. */
export async function planSaid(words: string, opts: { ledger?: Ledger } = {}): Promise<SaidChange | null> {
  const res = await sparkJSON<SaidChange>(
    [
      {
        role: "system",
        content:
          "You turn a person's request about their clay figurine into ONE edit of its hair, outfit (the top they wear) or an extra (glasses, hat, scarf, headphones, earrings). " +
          "Write `change` in English as a short phrase starting with 'the hair is', 'the top is' or 'add'. Never change the face, body, pose or background. " +
          "Two or three extras asked for together are one edit ('add a red beanie and round glasses'). " +
          "Set overFace to 'glasses' for anything worn on the eyes, 'hat' for anything on the head, 'glasses+hat' for both, otherwise null. Refuse brands, logos, text and real people by returning part 'none'.",
      },
      { role: "user", content: words.slice(0, 200) },
    ],
    {
      name: "figure_change",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["part", "change", "overFace"],
        properties: {
          part: { type: "string", enum: ["hair", "outfit", "extra", "none"] },
          change: { type: "string" },
          overFace: { type: ["string", "null"], enum: ["glasses", "hat", "glasses+hat", null] },
        },
      },
    },
    { reasoningEffort: "minimal", maxTokens: 2000, op: "look.say", ledger: opts.ledger },
  );
  return validateSaid(res.data);
}
