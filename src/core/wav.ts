// Minimal WAV helpers (no ffmpeg needed on the server).
// Voice Transcribe accepts RIFF/WAVE mono s16 at 16 kHz or 24 kHz.

export interface Pcm {
  sampleRate: number;
  samples: Float32Array; // mono, -1..1
}

export function decodeWav(buf: Buffer | Uint8Array): Pcm {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a RIFF/WAVE file");
  let off = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  let data: Buffer | null = null;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4);
    let size = b.readUInt32LE(off + 4);
    const body = off + 8;
    if (body + size > b.length) size = b.length - body; // tolerate streaming headers
    if (id === "fmt ") {
      fmt = { format: b.readUInt16LE(body), channels: b.readUInt16LE(body + 2), rate: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
      if (fmt.format === 0xfffe && size >= 26) fmt.format = b.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === "data") {
      data = b.subarray(body, body + size);
    }
    off = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("wav missing fmt or data chunk");
  const { channels, bits, format } = fmt;
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const p = (i * channels + c) * bytes;
      let v: number;
      if (format === 3 && bits === 32) v = data.readFloatLE(p);
      else if (bits === 16) v = data.readInt16LE(p) / 32768;
      else if (bits === 24) v = ((data[p] | (data[p + 1] << 8) | (data[p + 2] << 16)) << 8 >> 8) / 8388608;
      else if (bits === 32) v = data.readInt32LE(p) / 2147483648;
      else if (bits === 8) v = (data[p] - 128) / 128;
      else throw new Error(`unsupported wav: format ${format}, ${bits} bit`);
      acc += v;
    }
    out[i] = acc / channels;
  }
  return { sampleRate: fmt.rate, samples: out };
}

export function resample(pcm: Pcm, rate: number): Pcm {
  if (pcm.sampleRate === rate) return pcm;
  const ratio = pcm.sampleRate / rate;
  const n = Math.floor(pcm.samples.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, pcm.samples.length - 1);
    const t = x - i0;
    out[i] = pcm.samples[i0] * (1 - t) + pcm.samples[i1] * t;
  }
  return { sampleRate: rate, samples: out };
}

export function encodeWav(pcm: Pcm): Buffer {
  const n = pcm.samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(pcm.sampleRate, 24);
  buf.writeUInt32LE(pcm.sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, pcm.samples[i]));
    buf.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2);
  }
  return buf;
}

/** Any WAV → mono s16 24 kHz (what Voice Transcribe and the TTS reference expect). */
export function toVtWav(buf: Buffer): { wav: Buffer; durationMs: number; pcm: Pcm } {
  const pcm = resample(decodeWav(buf), 24000);
  return { wav: encodeWav(pcm), durationMs: Math.round((pcm.samples.length / pcm.sampleRate) * 1000), pcm };
}

export function durationMs(pcm: Pcm): number {
  return Math.round((pcm.samples.length / pcm.sampleRate) * 1000);
}

/** Share of 20 ms frames whose RMS is below -45 dBFS. */
export function silenceRatio(pcm: Pcm): number {
  const frame = Math.max(1, Math.round(pcm.sampleRate * 0.02));
  let silent = 0, total = 0;
  for (let i = 0; i + frame <= pcm.samples.length; i += frame) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += pcm.samples[j] * pcm.samples[j];
    const rms = Math.sqrt(s / frame);
    if (rms < 0.0056) silent++; // -45 dBFS
    total++;
  }
  return total ? silent / total : 1;
}

/** RMS envelope at `fps` frames per second, normalized 0..1 (drives the speaking pulse). */
export function rmsEnvelope(pcm: Pcm, fps = 30): number[] {
  const hop = Math.max(1, Math.round(pcm.sampleRate / fps));
  const env: number[] = [];
  let max = 1e-6;
  for (let i = 0; i < pcm.samples.length; i += hop) {
    let s = 0;
    const end = Math.min(i + hop, pcm.samples.length);
    for (let j = i; j < end; j++) s += pcm.samples[j] * pcm.samples[j];
    const r = Math.sqrt(s / Math.max(1, end - i));
    env.push(r);
    if (r > max) max = r;
  }
  return env.map((v) => Math.round((v / max) * 100) / 100);
}
