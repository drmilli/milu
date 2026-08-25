import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, calls, transcripts } from '../db';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Caller-intent classification for finished calls.
 *
 * `calls.intent` drives the "top caller intents" analytics breakdown. It is
 * resolved from two sources, strongest first:
 *
 *   1. What the agent actually did. A booking or an escalation is ground truth,
 *      costs nothing, and is recorded the moment the tool runs.
 *   2. What the caller said. For calls where no tool fired — most FAQ and
 *      complaint calls — the transcript is classified once, after the call has
 *      ended, so nothing is added to the in-call latency budget.
 *
 * Classification is best-effort throughout: an LLM failure degrades to a keyword
 * heuristic, and that degrades to UNKNOWN. It never blocks or fails a call.
 */

export type CallIntent = 'FAQ' | 'BOOKING' | 'ORDER_STATUS' | 'COMPLAINT' | 'ESCALATE' | 'UNKNOWN';

const VALID_INTENTS: readonly CallIntent[] = ['FAQ', 'BOOKING', 'ORDER_STATUS', 'COMPLAINT', 'ESCALATE', 'UNKNOWN'];

// ─── Keyword heuristic (fallback when no LLM is available) ────────────────────

/**
 * Ordered most- to least-specific: "where is my order" must land on ORDER_STATUS
 * before the generic "order" keyword can pull it into BOOKING.
 */
const PATTERNS: Array<{ intent: CallIntent; patterns: RegExp[] }> = [
  {
    intent: 'ESCALATE',
    patterns: [
      /speak (to|with) (a |the |your )?(human|person|agent|manager|representative|someone|supervisor)/i,
      /transfer me/i,
      /put me through/i,
      /connect me (to|with)/i,
      /talk to (someone|a person|a human|your manager|your supervisor)/i,
      /real person/i,
    ],
  },
  {
    intent: 'ORDER_STATUS',
    patterns: [
      /order status/i,
      /where is my (order|delivery|package|parcel|item)/i,
      /track(ing)? (my |the )?(order|delivery|package)/i,
      /when (will|does) (it|my order|my delivery|my package)/i,
      /(has|have) (my|the) (order|delivery|package) (shipped|arrived|left)/i,
    ],
  },
  {
    intent: 'COMPLAINT',
    patterns: [
      /compla(in|int)/i,
      /unhappy|dissatisfied|disappointed/i,
      /not (happy|satisfied|working)/i,
      /(problem|issue) with/i,
      /broken|damaged|faulty|wrong item/i,
      /refund|money back/i,
    ],
  },
  {
    intent: 'BOOKING',
    patterns: [
      /book(ing)?\b/i,
      /appointment/i,
      /schedul(e|ing)/i,
      /reserv(e|ation)/i,
      /(place|make|put in) (an? )?order/i,
      /i want to order/i,
      // Deliberately no bare "delivery to X" pattern: "how much is delivery to
      // Lekki" is a pricing question, not a booking.
    ],
  },
  {
    intent: 'FAQ',
    patterns: [
      /how (much|many|do|does|can|long)/i,
      /what (is|are|time|hour)/i,
      /when (are|do|does) you/i,
      /do you (offer|have|accept|deliver|sell)/i,
      /where (are|is) (you|your)/i,
      /are you open/i,
    ],
  },
];

export function classifyIntentHeuristic(text: string): CallIntent {
  for (const { intent, patterns } of PATTERNS) {
    if (patterns.some(p => p.test(text))) return intent;
  }
  return 'UNKNOWN';
}

// ─── LLM classification ───────────────────────────────────────────────────────

const CLASSIFY_PROMPT = [
  'You classify what a customer wanted from a phone call, based on what they said.',
  'Reply with EXACTLY ONE of these words and nothing else:',
  '',
  'FAQ — a general question about the business (hours, prices, location, services offered)',
  'BOOKING — wants to book an appointment, or place a new order or delivery',
  'ORDER_STATUS — asking about an order or delivery they have already placed',
  'COMPLAINT — reporting a problem, fault, or dissatisfaction',
  'ESCALATE — asked to be put through to a human',
  'UNKNOWN — too short, unclear, or nothing was actually asked',
  '',
  'The caller may speak English, Nigerian Pidgin, Arabic, or a mix. Classify on meaning, not wording.',
  'If more than one applies, pick the main reason they called.',
].join('\n');

async function classifyWithLlm(callerText: string): Promise<CallIntent | null> {
  if (!env.OPENAI_API_KEY) return null;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 5,
        messages: [
          { role: 'system', content: CLASSIFY_PROMPT },
          { role: 'user', content: callerText.slice(0, 4000) },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'Intent classification request failed');
      return null;
    }

    const json = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = (json.choices?.[0]?.message?.content ?? '').trim().toUpperCase().replace(/[^A-Z_]/g, '');
    return VALID_INTENTS.includes(raw as CallIntent) ? (raw as CallIntent) : null;
  } catch (err) {
    logger.warn({ err }, 'Intent classification errored');
    return null;
  }
}

/** Classify a finished call from what the caller said. Never throws. */
export async function classifyCallIntent(callerText: string): Promise<CallIntent> {
  const text = callerText.trim();
  if (text.length < 3) return 'UNKNOWN';
  return (await classifyWithLlm(text)) ?? classifyIntentHeuristic(text);
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Writes `calls.intent` only when it is still unset, so the first (strongest)
 * signal wins and repeat calls from multiple completion paths are harmless.
 */
export async function setCallIntentIfUnset(callId: string, intent: CallIntent): Promise<void> {
  await db.update(calls)
    .set({ intent })
    .where(and(eq(calls.id, callId), isNull(calls.intent)))
    .catch(err => logger.warn({ err, callId, intent }, 'Failed to set call intent'));
}

/**
 * Resolves and stores the intent for a call that has ended.
 *
 * Skips the work entirely when a tool already recorded one. Safe to call
 * fire-and-forget from any completion path.
 */
export async function recordCallIntent(callId: string): Promise<void> {
  try {
    if (!callId) return;

    const [row] = await db.select({ intent: calls.intent })
      .from(calls).where(eq(calls.id, callId)).limit(1);
    if (!row || row.intent) return; // no such call, or a tool already classified it

    const callerTurns = await db.select({ text: transcripts.text })
      .from(transcripts)
      .where(and(eq(transcripts.callId, callId), eq(transcripts.speaker, 'caller')))
      .orderBy(asc(transcripts.createdAt))
      .limit(30);

    if (!callerTurns.length) {
      // Caller never said anything — they hung up during the greeting.
      await setCallIntentIfUnset(callId, 'UNKNOWN');
      return;
    }

    const intent = await classifyCallIntent(callerTurns.map(t => t.text).join('\n'));
    await setCallIntentIfUnset(callId, intent);
    logger.info({ callId, intent, turns: callerTurns.length }, 'Call intent classified');
  } catch (err) {
    logger.warn({ err, callId }, 'recordCallIntent failed');
  }
}
