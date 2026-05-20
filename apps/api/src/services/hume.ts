import WebSocket from 'ws';
import { logger } from '../config/logger';

export type HumeEmotion = { name: string; score: number };

type EmotionCallback = (emotions: HumeEmotion[], source: 'prosody' | 'language') => void;

// ── μ-law → PCM16 → WAV ──────────────────────────────────────────────────────

function mulawToLinear16(byte: number): number {
  // Standard G.711 μ-law decoding
  byte = ~byte & 0xff;
  const sign = byte & 0x80;
  const exp = (byte >> 4) & 0x07;
  const mant = byte & 0x0f;
  let s = ((mant << 1) | 1) << (exp + 2);
  s -= 132;
  return sign ? -s : s;
}

function mulawToWav(mulaw: Buffer): Buffer {
  const pcm = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) {
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, mulawToLinear16(mulaw[i]))), i * 2);
  }

  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);          // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

// ── HumeStream ───────────────────────────────────────────────────────────────

const AUDIO_FLUSH_MS = 4000; // send 4-second audio windows to Hume

export class HumeStream {
  private ws: WebSocket;
  private ready = false;
  private closed = false;
  private audioChunks: Buffer[] = [];
  private audioBytes = 0;
  private flushTimer: NodeJS.Timeout | null = null;

  // Queue for correlating text emotion responses to transcript IDs
  private textQueue: string[] = [];

  constructor(
    apiKey: string,
    private readonly onEmotions: EmotionCallback,
  ) {
    this.ws = new WebSocket(
      `wss://api.hume.ai/v0/stream/models?apiKey=${encodeURIComponent(apiKey)}`,
    );

    this.ws.on('open', () => {
      this.ready = true;
      this.flushTimer = setInterval(() => this.flushAudio(), AUDIO_FLUSH_MS);
      logger.info('Hume WS connected');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.prosody?.predictions?.[0]?.emotions?.length) {
          const emotions: HumeEmotion[] = (msg.prosody.predictions[0].emotions as HumeEmotion[])
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
          this.onEmotions(emotions, 'prosody');
        }

        if (msg.language?.predictions?.[0]?.emotions?.length) {
          const emotions: HumeEmotion[] = (msg.language.predictions[0].emotions as HumeEmotion[])
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
          this.onEmotions(emotions, 'language');
        }
      } catch { /* ignore */ }
    });

    this.ws.on('error', (err: Error) => {
      logger.warn({ err: err.message }, 'Hume WS error');
    });

    this.ws.on('close', () => {
      this.ready = false;
      if (this.flushTimer) clearInterval(this.flushTimer);
    });
  }

  // ── Feed audio (μ-law chunks from Twilio) ──────────────────────────────────

  sendAudio(chunk: Buffer): void {
    if (this.closed) return;
    this.audioChunks.push(chunk);
    this.audioBytes += chunk.length;
    // 8000 bytes/sec for μ-law @ 8kHz — flush early if we have >4s
    if (this.audioBytes >= 32000) this.flushAudio();
  }

  private flushAudio(): void {
    if (!this.ready || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.audioChunks.length === 0) return;

    const combined = Buffer.concat(this.audioChunks);
    this.audioChunks = [];
    this.audioBytes = 0;

    const wav = mulawToWav(combined);
    this.ws.send(JSON.stringify({
      data: wav.toString('base64'),
      models: { prosody: { identify_speakers: false } },
      stream_window_ms: AUDIO_FLUSH_MS,
    }));
  }

  // ── Send a caller utterance for text-based emotion ─────────────────────────

  sendText(text: string): void {
    if (!this.ready || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      data: text,
      models: { language: { granularity: 'utterance' } },
    }));
  }

  // ── Graceful close ─────────────────────────────────────────────────────────

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushAudio(); // send any remaining audio
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}
