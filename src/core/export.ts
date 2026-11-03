// Build the self-contained replay.html: stage engine + data + personas + audio, one file, no network.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { PerformItem, StageMember } from "../stage/engine";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function bundleReplayScript(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(here, "../stage/replay-entry.ts")],
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: true,
    write: false,
    legalComments: "none",
  });
  return out.outputFiles[0].text;
}

const PAGE_CSS = `
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#02040a;color:#e9f6ff;font-family:ui-sans-serif,system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif}
#app{display:flex;gap:28px;justify-content:center;align-items:flex-start;padding:24px;min-height:100%;flex-wrap:wrap}
.rp-phone{width:min(400px,100%);height:min(820px,calc(100vh - 48px));display:flex;flex-direction:column;border-radius:34px;overflow:hidden;border:1px solid rgba(127,227,255,.25);box-shadow:0 0 60px rgba(58,168,255,.15);background:#05070f}
.rp-top{padding:16px 18px 10px;border-bottom:1px solid rgba(127,227,255,.12)}
.rp-room{font-weight:700;letter-spacing:.02em}.rp-sub{font-size:12px;color:#8aa3bf;margin-top:2px}
.rp-stage{flex:1;position:relative;min-height:0}
.rp-bar{height:3px;background:rgba(127,227,255,.12)}.rp-fill{height:100%;width:0;background:#7fe3ff;transition:width .4s}
.rp-controls{display:flex;gap:10px;align-items:center;justify-content:center;padding:14px}
.rp-controls button{font:inherit;color:#e9f6ff;background:rgba(127,227,255,.08);border:1px solid rgba(127,227,255,.3);border-radius:999px;padding:10px 14px;cursor:pointer}
.rp-controls .rp-play{background:#7fe3ff;color:#03111d;font-weight:700;border:none;padding:12px 18px}
.rp-side{width:min(460px,100%);font-size:13px}
.rp-side h3{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7fe3ff;margin:18px 0 8px}
.rp-note{color:#8aa3bf;margin:4px 0}
.rp-log{white-space:pre-wrap;background:#070c18;border:1px solid rgba(127,227,255,.15);border-radius:10px;padding:10px;font-size:11.5px;color:#bfe9ff}
.rp-lines{padding-left:22px;margin:10px 0}.rp-lines li{padding:4px 0;color:#c7d6e6}.rp-lines li.on{color:#fff}.rp-lines li.on b{color:#7fe3ff}
.rp-lines .t{margin-left:4px}.rp-lines .meta{display:block;font-size:11px;color:#6f86a3}
.rp-lines .rej{display:block;font-size:11px;color:#ffb27a}
.rp-rec{border-collapse:collapse;width:100%}.rp-rec td,.rp-rec th{border-bottom:1px solid rgba(127,227,255,.12);padding:5px 6px;text-align:left;font-variant-numeric:tabular-nums}
.rp-rec th{color:#8aa3bf;font-weight:500}
`;

export interface ReplayPayload {
  room: string;
  members: StageMember[];
  items: PerformItem[];
  director: { source: string; attempts: number; log: unknown[]; flags: string[] };
  receipt: unknown;
}

export async function buildReplayHtml(payload: ReplayPayload): Promise<string> {
  const script = await bundleReplayScript();
  const data = JSON.stringify({ ...payload, generatedAt: new Date().toISOString() }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scene replay</title><style>${PAGE_CSS}</style></head><body><div id="app"></div>
<script>window.__SCENE__=${data};</script><script>${script}</script></body></html>`;
}

export function dataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
