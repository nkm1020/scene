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
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0e0d0c;color:#fff;font-family:"Inter","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
#app{display:flex;gap:12px;justify-content:center;align-items:flex-start;padding:12px;flex-wrap:wrap}
.rp-phone{width:min(400px,100%);height:min(840px,calc(100vh - 24px));display:flex;flex-direction:column;border-radius:20px;overflow:hidden;background:#0e0d0c}
.rp-top{padding:14px 16px 10px}.rp-room{font-weight:600;font-size:16px}.rp-sub{font-size:12px;color:#949494}
.rp-stage{flex:1;position:relative;min-height:0;border-radius:20px;overflow:hidden;background:#000;margin:0 8px}.rp-stage>.s3-root{position:absolute;inset:0}
.rp-bar{height:3px;background:#2a2826;margin:10px 16px 0;border-radius:2px;overflow:hidden}.rp-fill{height:100%;width:0;background:#f2b33d;transition:width .4s}
.rp-controls{display:flex;gap:8px;align-items:center;justify-content:center;padding:12px}
.rp-controls button{font:inherit;border:none;cursor:pointer;border-radius:999px;height:40px;padding:0 16px;background:#2a2826;color:#fff;font-weight:500}
.rp-controls .rp-play{background:#fff;color:#000;font-weight:600;height:48px;padding:0 24px}
.rp-side{width:min(520px,100%);background:#181716;border-radius:20px;padding:22px}
.rp-side h2{font-size:18px;font-weight:600;margin:22px 0 8px}.rp-side h2:first-child{margin-top:0}
.rp-note{color:#b4b4b4;margin:6px 0}
.rp-log{white-space:pre-wrap;background:#2a2826;border-radius:14px;padding:12px;font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:#b4b4b4}
.rp-lines{padding-left:22px;margin:8px 0}.rp-lines li{padding:6px 0}.rp-lines li.on b{color:#f2b33d}
.rp-lines .meta{display:block;font-size:13px;color:#949494}.rp-lines .rej{display:block;font-size:13px;color:#e5566f}
.rp-rec{border-collapse:collapse;width:100%}.rp-rec td,.rp-rec th{padding:8px 4px;text-align:left;font-variant-numeric:tabular-nums;border-bottom:1px solid #1d1b19}.rp-rec td:not(:first-child),.rp-rec th:not(:first-child){text-align:right}.rp-rec th{color:#949494;font-weight:400}
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
<title>Scene replay</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>${PAGE_CSS}</style></head><body><div id="app"></div>
<script>window.__SCENE__=${data};</script><script>${script}</script></body></html>`;
}

export function dataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
