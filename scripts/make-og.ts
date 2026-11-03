// Build public/og.png (1200x630) for link previews: the seed personas at the table + title.
import sharp from "sharp";
const W = 1200, H = 630;
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
 <radialGradient id="g" cx="0.72" cy="1.05" r="0.75"><stop offset="0" stop-color="#1d4f8a"/><stop offset="1" stop-color="#05070f"/></radialGradient>
 <radialGradient id="t" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#16345e"/><stop offset="1" stop-color="#060d1f"/></radialGradient>
 <pattern id="s" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#7fe3ff" opacity="0.05"/></pattern>
</defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="64" y="150" font-family="Helvetica, Arial, sans-serif" font-size="26" letter-spacing="6" fill="#7fe3ff">SCENE</text>
<text x="64" y="230" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="52" fill="#e9f6ff">Text bubbles are a</text>
<text x="64" y="298" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="52" fill="#e9f6ff">layout for screens.</text>
<text x="64" y="366" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="52" fill="#7fe3ff">Glasses don't have one.</text>
<text x="64" y="446" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#c8d8ea">Friends as holograms, in their own voices,</text>
<text x="64" y="482" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#c8d8ea">saying exactly what they typed — nothing else.</text>
<text x="64" y="572" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#8aa3bf">Muse Voice Transcribe · Muse Spark · Muse Image · SAM 3.1</text>
</svg>`);
const table = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="520" height="150"><ellipse cx="260" cy="75" rx="250" ry="66" fill="#0a1a36" stroke="#7fe3ff" stroke-opacity="0.6" stroke-width="3"/><ellipse cx="260" cy="75" rx="150" ry="38" fill="none" stroke="#7fe3ff" stroke-opacity="0.18"/></svg>`);
const p = async (f: string, h: number, dim = false) => {
  let img = sharp(`public/seed/${f}.webp`).resize({ height: h });
  if (dim) img = img.modulate({ brightness: 0.45, saturation: 0.6 });
  return img.png().toBuffer();
};
const jay = await p("jay-away", 210, true), mina = await p("mina", 250), sam = await p("sam", 225);
await sharp(bg)
  .composite([
    { input: mina, left: 845, top: 200 },
    { input: jay, left: 740, top: 258 },
    { input: sam, left: 995, top: 246 },
    { input: table, left: 690, top: 425 },
    { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="url(#s)"/><defs><pattern id="s" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#7fe3ff" opacity="0.05"/></pattern></defs></svg>`), left: 0, top: 0 },
  ])
  .png()
  .toFile("public/og.png");
console.log("public/og.png");
