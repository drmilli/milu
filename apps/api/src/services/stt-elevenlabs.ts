import WebSocket from 'ws';
import { logger } from '../config/logger';

/**
 * ElevenLabs Scribe v2 Realtime speech-to-text over WebSocket.
 *
 * Used for the languages Deepgram has no model for — Yoruba, Igbo, Hausa and
 * Swahili. Scribe accepts `ulaw_8000` natively, which is exactly what Twilio
 * Media Streams deliver, so call audio is forwarded without transcoding.
 *
 * Turn boundaries come from Scribe's own VAD: it emits `partial_transcript`
 * while the caller is speaking and `committed_transcript` once silence passes
 * the threshold. Those map onto Deepgram's interim / `speech_final` events, so
 * the calling code's turn-taking logic is unchanged.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
 */

const WS_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
const MODEL_ID = 'scribe_v2_realtime';

/** Minimal surface shared with the Deepgram connection so either can be swapped in. */
export type SttConnection = {
  /** Forward a chunk of caller audio (raw μ-law bytes, as they arrive from Twilio). */
  send(audio: Buffer): void;
  /** Close the upstream connection. */
  finish(): void;
};

export type SttCallbacks = {
  /** Upstream is ready to receive audio. */
  onOpen: () => void;
  /** Interim text — used only to detect that the caller has started speaking. */
  onPartial: (text: string) => void;
  /** A finished utterance — this drives a conversation turn. */
  onFinal: (text: string) => void;
  onError: (err: unknown) => void;
  onClose: () => void;
};

export function connectElevenLabsStt(opts: {
  apiKey: string;
  /** BCP-47-ish language code, e.g. 'yo', 'ig', 'ha', 'sw'. */
  languageCode: string;
  callId: string;
  callbacks: SttCallbacks;
}): SttConnection {
  const { apiKey, languageCode, callId, callbacks } = opts;

  const params = new URLSearchParams({
    model_id: MODEL_ID,
    language_code: languageCode,
    // Twilio sends 8 kHz G.711 μ-law; Scribe takes it directly.
    audio_format: 'ulaw_8000',
    // Let Scribe close each utterance on silence, mirroring Deepgram's
    // speech_final. The alternative ('manual') would need our own VAD.
    commit_strategy: 'vad',
    vad_threshold: '0.4',
    vad_silence_threshold_secs: '1.0',
  });

  const ws = new WebSocket(`${WS_URL}?${params.toString()}`, {
    headers: { 'xi-api-key': apiKey },
  });

  let ready = false;
  let closed = false;
  // Twilio starts sending audio immediately; hold it until the socket opens
  // rather than dropping the first second of the caller's speech.
  const pending: Buffer[] = [];
  // ~8 KB/s at 8 kHz μ-law, so this is a couple of seconds of headroom.
  const MAX_PENDING_BYTES = 32_000;
  let pendingBytes = 0;

  function sendChunk(audio: Buffer) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      message_type: 'input_audio_chunk',
      audio_base_64: audio.toString('base64'),
      commit: false,
    }));
  }

  ws.on('open', () => {
    ready = true;
    logger.info({ callId, languageCode, model: MODEL_ID }, 'ElevenLabs Scribe STT connected');
    for (const chunk of pending) sendChunk(chunk);
    pending.length = 0;
    pendingBytes = 0;
    callbacks.onOpen();
  });

  ws.on('message', (data: Buffer) => {
    let msg: any;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // Documented shape puts `text` at the top level; some message variants nest
    // it under `data`. Accept either rather than silently dropping transcripts.
    const text = String(msg.text ?? msg.data?.text ?? '').trim();

    switch (msg.message_type) {
      case 'session_started':
        logger.info({ callId }, 'ElevenLabs Scribe session started');
        break;
      case 'partial_transcript':
        if (text) callbacks.onPartial(text);
        break;
      case 'committed_transcript':
      case 'committed_transcript_with_timestamps':
        if (text) callbacks.onFinal(text);
        break;
      case 'error':
        logger.warn({ callId, msg }, 'ElevenLabs Scribe error message');
        callbacks.onError(new Error(msg.message ?? 'Scribe error'));
        break;
      default:
        break;
    }
  });

  ws.on('error', err => {
    logger.error({ err, callId }, 'ElevenLabs Scribe WS error');
    callbacks.onError(err);
  });

  ws.on('close', () => {
    ready = false;
    if (!closed) {
      closed = true;
      callbacks.onClose();
    }
  });

  return {
    send(audio: Buffer) {
      if (closed) return;
      if (ready) {
        sendChunk(audio);
        return;
      }
      // Still connecting — buffer, but never without bound.
      if (pendingBytes + audio.length > MAX_PENDING_BYTES) return;
      pending.push(audio);
      pendingBytes += audio.length;
    },
    finish() {
      if (closed) return;
      closed = true;
      try {
        if (ws.readyState === WebSocket.OPEN) ws.close();
        else ws.terminate();
      } catch { /* already gone */ }
    },
  };
}
