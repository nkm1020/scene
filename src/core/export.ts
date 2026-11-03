// Build the self-contained replay.html: stage engine + data + personas + audio, one file, no network.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { PerformItem, StageMember } from "../stage3d/engine";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function bundleReplayScript(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(here, "../stage3d/replay-entry.ts")],
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
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#d9d1c4;color:#1b1815;font-family:"Hanken Grotesk",ui-sans-serif,system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;font-size:16px;line-height:1.5}
#app{display:flex;gap:32px;justify-content:center;align-items:flex-start;padding:24px;flex-wrap:wrap}
.rp-phone{width:min(400px,100%);height:min(820px,calc(100vh - 48px));display:flex;flex-direction:column;border-radius:32px;overflow:hidden;background:#fff}
.rp-top{padding:16px 18px 12px}.rp-room{font-weight:700;font-size:18px}.rp-sub{font-size:14px;color:#6b6259}
.rp-stage{flex:1;position:relative;min-height:0}.rp-stage>.s3-root{position:absolute;inset:0}
.rp-bar{height:4px;background:#ebe6de}.rp-fill{height:100%;width:0;background:#2747d6;transition:width .4s}
.rp-controls{display:flex;gap:10px;align-items:center;justify-content:center;padding:14px}
.rp-controls button{font:inherit;border:none;cursor:pointer;border-radius:999px;padding:12px 16px;background:#ebe6de;color:#1b1815;font-weight:600}
.rp-controls .rp-play{background:#1b1815;color:#fff;font-weight:700;padding:13px 22px}
.rp-side{width:min(520px,100%);background:#fff;border-radius:24px;padding:24px}
.rp-side h2{font-size:20px;margin:18px 0 8px;letter-spacing:-.01em}.rp-side h2:first-child{margin-top:0}
.rp-note{color:#4a433c;margin:6px 0}
.rp-log{white-space:pre-wrap;background:#ebe6de;border-radius:12px;padding:12px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif}
.rp-lines{padding-left:22px;margin:8px 0}.rp-lines li{padding:6px 0}.rp-lines li.on b{color:#2747d6}
.rp-lines .meta{display:block;font-size:13px;color:#6b6259}.rp-lines .rej{display:block;font-size:13px;color:#a3360f}
.rp-rec{border-collapse:collapse;width:100%}.rp-rec td,.rp-rec th{padding:6px;text-align:left;font-variant-numeric:tabular-nums}.rp-rec tr:nth-child(even){background:#f3f0eb}.rp-rec th{color:#6b6259;font-weight:500}
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
<title>Scene replay</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"><style>${PAGE_CSS}</style></head><body><div id="app"></div>
<script>window.__SCENE__=${data};</script><script>${script}</script></body></html>`;
}

export function dataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
