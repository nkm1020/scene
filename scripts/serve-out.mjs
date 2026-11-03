// Tiny static server for out/ (preview replay.html locally): node scripts/serve-out.mjs [port]
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out");
const port = Number(process.argv[2] ?? 4173);
const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".wav": "audio/wav", ".png": "image/png", ".js": "text/javascript" };
http.createServer(async (req, res) => {
  const p = path.join(root, decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (!p.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(p.endsWith("/") ? path.join(p, "index.html") : p);
    res.writeHead(200, { "Content-Type": types[path.extname(p)] ?? "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end("not found"); }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
