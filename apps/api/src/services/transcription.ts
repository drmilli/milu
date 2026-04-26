import { env } from '../config/env';
import { logger } from '../config/logger';
import { eq } from 'drizzle-orm';
import { db, calls, transcripts } from '../db';

export async function transcribeRecordingSnippet(recordingUrl: string): Promise<string> {
  if (!env.DEEPGRAM_API_KEY) return '';
  if (!recordingUrl) return '';

  try {
    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en', {
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
