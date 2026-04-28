import { env } from '../config/env';
import { logger } from '../config/logger';
import { eq } from 'drizzle-orm';
import { db, calls, transcripts } from '../db';

function extFromContentType(contentType: string) {
  const ct = contentType.toLowerCase();
  if (ct.includes('audio/wav') || ct.includes('audio/x-wav')) return 'wav';
  if (ct.includes('audio/mpeg') || ct.includes('audio/mp3')) return 'mp3';
  if (ct.includes('audio/ogg')) return 'ogg';
  if (ct.includes('audio/webm')) return 'webm';
  if (ct.includes('audio/mp4') || ct.includes('audio/m4a')) return 'm4a';
  return 'mp3';
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

export async function transcribeRecordingSnippet(recordingUrl: string): Promise<string> {
  if (!recordingUrl) return '';

  try {
    if (env.DEEPGRAM_API_KEY) {
      const timeout = withTimeout(10000);
      const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=en&punctuate=true', {
        method: 'POST',
        headers: {
          Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: recordingUrl }),
        signal: timeout.signal,
      });
      timeout.done();

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Deepgram error ${res.status}: ${err}`);
      }

      const data = await res.json() as {
        results?: {
          channels?: Array<{
            alternatives?: Array<{
              transcript?: string;
            }>;
          }>;
        };
      };

      const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
      return text.trim();
    }

    if (env.OPENAI_API_KEY) {
      const audioTimeout = withTimeout(20000);
      const audioRes = await fetch(recordingUrl, { signal: audioTimeout.signal });
      audioTimeout.done();
      if (!audioRes.ok) {
        const err = await audioRes.text();
        throw new Error(`Recording fetch error ${audioRes.status}: ${err}`);
      }

      const contentType = audioRes.headers.get('content-type') ?? 'audio/mpeg';
      const ext = extFromContentType(contentType);
      const bytes = new Uint8Array(await audioRes.arrayBuffer());
      const form = new FormData();
      form.append('model', 'whisper-1');
      form.append('file', new Blob([bytes], { type: contentType }), `audio.${ext}`);

      const timeout = withTimeout(30000);
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: form,
        signal: timeout.signal,
      });
      timeout.done();

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI transcription error ${res.status}: ${err}`);
      }

      const data = await res.json() as { text?: string };
      return (data.text ?? '').trim();
    }

    return '';
  } catch (err) {
    logger.error({ err, recordingUrl }, 'Snippet transcription failed');
    return '';
  }
}

export async function transcribeCallRecording(callId: string, recordingUrl: string): Promise<void> {
  if (!env.DEEPGRAM_API_KEY) {
    logger.warn({ callId }, 'Deepgram key not set — skipping transcription');
    return;
  }

  try {
    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&language=en', {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: recordingUrl }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Deepgram error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      results: {
        channels: Array<{
          alternatives: Array<{
            words: Array<{ word: string; speaker: number; start: number }>;
            transcript: string;
          }>;
        }>;
      };
    };

    const words = data.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];

    // Group words by speaker into turns
    const turns: { speaker: number; text: string }[] = [];
    let currentSpeaker = -1;
    let currentText = '';

    for (const w of words) {
      if (w.speaker !== currentSpeaker) {
        if (currentText.trim()) turns.push({ speaker: currentSpeaker, text: currentText.trim() });
        currentSpeaker = w.speaker;
        currentText = w.word + ' ';
      } else {
        currentText += w.word + ' ';
      }
    }
    if (currentText.trim()) turns.push({ speaker: currentSpeaker, text: currentText.trim() });

    // Save turns as transcript entries
    for (const turn of turns) {
      await db.insert(transcripts).values({
        callId,
        speaker: turn.speaker === 0 ? 'agent' : 'caller',
        text: turn.text,
      });
    }

    // Mark call as transcribed
    await db.update(calls).set({ status: 'COMPLETED' }).where(eq(calls.id, callId));
    logger.info({ callId, turns: turns.length }, 'Call transcription saved');
  } catch (err) {
    logger.error({ err, callId, recordingUrl }, 'Transcription failed');
  }
}
