// Meta SAM 3D Objects: one image + one mask → a 3D mesh (GLB). Hosted by fal.ai (fal-ai/sam-3/3d-objects).
// Scene feeds it a Muse Image figurine and the SAM 3.1 mask of that figurine, so all three steps are Meta models.

import { Ledger, globalLedger, PRICE } from "./ledger";

const ENDPOINT = "fal-ai/sam-3/3d-objects";
const QUEUE = "https://queue.fal.run";

export interface Sam3dResult {
  glb: Buffer;
  glbUrl: string;
  metadata: unknown;
  ms: number;
}

function falKey(): string {
  const k = process.env.FAL_KEY;
  if (!k) throw new Error("FAL_KEY is not set (needed for SAM 3D Objects on fal.ai)");
  return k;
}

const pngDataUrl = (b: Buffer, mime = "image/png") => `data:${mime};base64,${b.toString("base64")}`;

export async function reconstruct3d(
  image: Buffer,
  mask: Buffer | null,
  opts: { prompt?: string; seed?: number; op?: string; ledger?: Ledger; timeoutMs?: number } = {},
): Promise<Sam3dResult> {
  const ledger = opts.ledger ?? globalLedger;
  const t0 = performance.now();
  const headers = { Authorization: `Key ${falKey()}`, "Content-Type": "application/json" };
  let ok = false;
  try {
    const submit = await fetch(`${QUEUE}/${ENDPOINT}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        image_url: pngDataUrl(image),
        ...(mask ? { mask_urls: [pngDataUrl(mask)] } : { prompt: opts.prompt ?? "clay figurine" }),
        export_textured_glb: true,
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      }),
    });
    const sub = (await submit.json()) as any;
    if (!submit.ok) throw new Error(`sam3d submit HTTP ${submit.status}: ${JSON.stringify(sub).slice(0, 300)}`);
    const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
    let status: any = null;
    while (Date.now() < deadline) {
      const r = await fetch(sub.status_url, { headers });
      status = await r.json();
      if (status.status === "COMPLETED") break;
      await new Promise((res) => setTimeout(res, 1200));
    }
    if (status?.status !== "COMPLETED") throw new Error(`sam3d timed out (${status?.status ?? "unknown"})`);
    if (status.error) throw new Error(`sam3d failed: ${status.error_type ?? ""} ${status.error}`);
    const res = await fetch(sub.response_url, { headers });
    const out = (await res.json()) as any;
    if (!res.ok || !out?.model_glb?.url) throw new Error(`sam3d result HTTP ${res.status}: ${JSON.stringify(out).slice(0, 300)}`);
    const glbRes = await fetch(out.model_glb.url);
    if (!glbRes.ok) throw new Error(`sam3d glb download HTTP ${glbRes.status}`);
    const glb = Buffer.from(await glbRes.arrayBuffer());
    ok = true;
    return { glb, glbUrl: out.model_glb.url, metadata: out.metadata, ms: Math.round(performance.now() - t0) };
  } finally {
    ledger.add({ model: "sam-3d-objects", op: opts.op ?? "figure.lift3d", ms: Math.round(performance.now() - t0), usd: ok ? PRICE.sam3dPerObject : 0, ok });
  }
}
