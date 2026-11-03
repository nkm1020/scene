"use client";
// Browser recording → WAV (mono s16, 24 kHz), the format Voice Transcribe accepts.

export class Recorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  startedAt = 0;

  async start() {
    this.stream ??= await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(100);
    this.startedAt = performance.now();
  }

  async stop(): Promise<{ wav: Blob; durationMs: number }> {
    const rec = this.rec;
    if (!rec) throw new Error("not recording");
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    this.rec = null;
    const blob = new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
    return blobToWav(blob);
  }

  release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

export async function blobToWav(blob: Blob, rate = 24000): Promise<{ wav: Blob; durationMs: number }> {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const src = audio.getChannelData(0);
  const ratio = audio.sampleRate / rate;
  const n = Math.floor(src.length / ratio);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio, i0 = Math.floor(x), i1 = Math.min(i0 + 1, src.length - 1), t = x - i0;
    const v = Math.max(-1, Math.min(1, src[i0] * (1 - t) + src[i1] * t));
    pcm[i] = v < 0 ? v * 32768 : v * 32767;
  }
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return { wav: new Blob([buf], { type: "audio/wav" }), durationMs: Math.round((n / rate) * 1000) };
}
