import type { Request, Response } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, businessSettings, calls, escalations, knowledgeBases, knowledgeDocuments, transcripts } from '../db';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { voiceChat, type ChatMessage } from '../services/document-extract';
import { transcribeRecordingSnippet } from '../services/transcription';
import { notifyBusinessOwners } from '../services/notifications';
import { sendEscalationAlert } from '../services/whatsapp';
import { redis } from '../utils/redis';

function xml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// AT strips query params from callbackUrl — use path-only URLs.
// Regular speech turn  → /webhooks/at/voice
// Hold polling callback → /webhooks/at/voice/hold
function recordTurn(seconds: number, baseUrl: string) {
  const callbackUrl = `${baseUrl.replace(/\/$/, '')}/webhooks/at/voice`;
  const maxLength = Math.max(3, Math.min(30, seconds));
  return `<Record maxLength="${maxLength}" timeout="10" playBeep="true" callbackUrl="${callbackUrl}"></Record>`;
}

function holdRecord(baseUrl: string) {
  const callbackUrl = `${baseUrl.replace(/\/$/, '')}/webhooks/at/voice/hold`;
  return `<Record maxLength="2" timeout="2" playBeep="false" callbackUrl="${callbackUrl}"></Record>`;
}

// Module-level state — survives across requests within one process.
// sessionId (from AT) → callDbId (our DB UUID)
const sessionCallMap = new Map<string, string>();
// callDbId → precomputed XML response (set by background AI processing)
const replyCache = new Map<string, string>();

function pickFirstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return undefined;
}

function getAtPayload(req: Request): Record<string, string> {
  const src: Record<string, unknown> = (
    req.body && typeof req.body === 'object' && Object.keys(req.body as Record<string, unknown>).length > 0
      ? (req.body as Record<string, unknown>)
      : (req.query as Record<string, unknown>)
  );

  const out: Record<string, string> = {};
  for (const key of ['sessionId', 'callerNumber', 'destinationNumber', 'isActive', 'recordingUrl', 'durationInSeconds']) {
    const value = pickFirstString(src[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function sessionKey(sessionId: string) {
  return `at:voice:session:${sessionId}`;
}

function replyKey(callDbId: string) {
  return `at:voice:reply:${callDbId}`;
}

async function setSessionCall(sessionId: string, callDbId: string) {
  sessionCallMap.set(sessionId, callDbId);
  if (!redis) return;
  await redis.set(sessionKey(sessionId), callDbId, 'EX', 60 * 60).catch(() => null);
}

async function getSessionCall(sessionId: string): Promise<string | null> {
  const inMem = sessionCallMap.get(sessionId);
  if (inMem) return inMem;
  if (!redis) return null;
  const val = await redis.get(sessionKey(sessionId)).catch(() => null);
  if (val) sessionCallMap.set(sessionId, val);
  return val ?? null;
}

async function deleteSessionCall(sessionId: string) {
  sessionCallMap.delete(sessionId);
  if (!redis) return;
  await redis.del(sessionKey(sessionId)).catch(() => null);
}

async function setReply(callDbId: string, xmlResponse: string) {
  replyCache.set(callDbId, xmlResponse);
  if (!redis) return;
  await redis.set(replyKey(callDbId), xmlResponse, 'EX', 5 * 60).catch(() => null);
}

async function popReply(callDbId: string): Promise<string | null> {
  const inMem = replyCache.get(callDbId);
  if (inMem) {
    replyCache.delete(callDbId);
    return inMem;
  }

  if (!redis) return null;

  const key = replyKey(callDbId);
  const res = await redis.multi().get(key).del(key).exec().catch(() => null);
  const value = Array.isArray(res) ? (res[0]?.[1] as string | null | undefined) : null;
  if (typeof value === 'string' && value) return value;
  return null;
}

async function computeAtVoiceReply(
  callDbId: string,
  callerNumber: string | undefined,
  recordingUrl: string | undefined,
  baseUrl: string,
): Promise<string> {
  const retry = xml(
    `<Say>${escapeXml("I'm sorry, I didn't quite catch that. Please go ahead and speak after the beep.")}</Say>` +
    recordTurn(15, baseUrl),
  );

  if (!recordingUrl) return retry;

  const callerText = await transcribeRecordingSnippet(recordingUrl);
  logger.info({ callDbId, callerText: callerText.slice(0, 200) }, 'AT voice input');

  // Ignore very short transcripts — likely silence or noise
  if (!callerText || callerText.trim().length < 3) return retry;

  const [callRow] = await db.select().from(calls).where(eq(calls.id, callDbId)).limit(1);
  if (!callRow) {
    logger.warn({ callDbId }, 'AT voice input: call not found');
    return xml('<Hangup></Hangup>');
  }

  const [history, [agentRow], [bizRow], [kbRow], kbDocs] = await Promise.all([
    db.select({ speaker: transcripts.speaker, text: transcripts.text })
      .from(transcripts)
      .where(eq(transcripts.callId, callDbId))
      .orderBy(transcripts.createdAt),
    db.select().from(agentConfigs).where(eq(agentConfigs.businessId, callRow.businessId)).limit(1),
    db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, callRow.businessId)).limit(1),
    db.select({
      faqs: knowledgeBases.faqs,
      websiteSummary: knowledgeBases.websiteSummary,
      escalationNumber: knowledgeBases.escalationNumber,
    }).from(knowledgeBases).where(eq(knowledgeBases.businessId, callRow.businessId)).limit(1),
    db.select({ summary: knowledgeDocuments.summary })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.businessId, callRow.businessId))
      .limit(5),
  ]);

  await db.insert(transcripts).values({ callId: callDbId, speaker: 'caller', text: callerText });

  const messages: ChatMessage[] = [
    ...history.map(t => ({
      role: (t.speaker === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: t.text,
    })),
    { role: 'user' as const, content: callerText },
  ];

  const { reply, action } = await voiceChat(messages, {
    businessName: bizRow?.name ?? 'this business',
    agentName: agentRow?.name,
    agentLanguage: agentRow?.language,
    faqs: (kbRow?.faqs as { question: string; answer: string }[]) ?? [],
    websiteSummary: kbRow?.websiteSummary,
    docSummaries: kbDocs.map(d => d.summary ?? '').filter(Boolean),
    agentTone: agentRow?.tone,
    escalationNumber: kbRow?.escalationNumber,
    fallbackMessage: agentRow?.fallbackMessage,
  });

  await db.insert(transcripts).values({ callId: callDbId, speaker: 'agent', text: reply });

  if (action === 'escalate') {
    const reason = 'Agent escalation';
    const summary = callerText.slice(0, 600);

    const [existingEsc] = await db.select({ id: escalations.id }).from(escalations)
      .where(eq(escalations.callId, callDbId)).limit(1);
    if (!existingEsc) {
      await db.insert(escalations).values({ businessId: callRow.businessId, callId: callDbId, reason, summary });
    }

    const [settings] = await db.select({ whatsappNumber: businessSettings.whatsappNumber, whatsappVerified: businessSettings.whatsappVerified })
      .from(businessSettings).where(eq(businessSettings.businessId, callRow.businessId)).limit(1);
    if (settings?.whatsappVerified && settings.whatsappNumber) {
      await sendEscalationAlert(settings.whatsappNumber, callerNumber ?? callRow.callerNumber ?? '', summary).catch(() => null);
    }

    await notifyBusinessOwners(callRow.businessId, 'Call Escalated', `Caller ${callerNumber ?? callRow.callerNumber ?? ''} needs your attention. ${summary}`);
    await db.update(calls).set({ status: 'COMPLETED', resolution: 'HUMAN', endedAt: new Date() }).where(eq(calls.id, callDbId));

    return xml(`<Say>${escapeXml(reply)}</Say><Hangup></Hangup>`);
  }

  if (action === 'end') {
    await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() }).where(eq(calls.id, callDbId));
    return xml(`<Say>${escapeXml(reply)}</Say><Hangup></Hangup>`);
  }

  // Mark as AI-resolved once the agent successfully responds (don't overwrite HUMAN)
  await db.update(calls)
    .set({ resolution: 'AI' })
    .where(and(eq(calls.id, callDbId), isNull(calls.resolution)));

  return xml(`<Say>${escapeXml(reply)}</Say>` + recordTurn(15, baseUrl));
}

// POST /webhooks/at/voice — inbound call + recording turns
export async function handleAtVoiceWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const body = getAtPayload(req);
  const { sessionId, callerNumber, destinationNumber, isActive, recordingUrl } = body;

  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || 'https';
  const host = req.get('host');
  const baseUrl = host ? `${proto}://${host}` : env.API_URL.replace(/\/$/, '');

  logger.info({
    sessionId,
    callerNumber,
    destinationNumber,
    isActive,
    hasRecordingUrl: Boolean(recordingUrl),
    bodyKeys: Object.keys(body),
    // AT strips query params — confirm by logging
    queryKeys: Object.keys(req.query),
  }, 'AT voice webhook');

  // ── Recording turn: caller spoke ─────────────────────────────────────────
  if (recordingUrl) {
    // Look up callDbId from our session map (reliable since AT strips query params)
    const callDbId = sessionId ? await getSessionCall(sessionId) : null;

    if (!callDbId) {
      logger.warn({ sessionId, callerNumber, destinationNumber }, 'AT recording: no session mapping found');
      return res.send(xml('<Hangup></Hangup>'));
    }

    logger.info({ callDbId, sessionId, isActive }, 'AT recording callback received');

    // isActive=0 means the recording ended AND the caller likely hung up.
    // We delay handleAtCallEnd until AFTER AI processing so the transcript and
    // resolution are saved first. The call stays ACTIVE during this window so
    // the live dashboard card remains visible for the brief processing period.
    const callerHungUp = isActive === '0';

    // Start AI processing in background
    computeAtVoiceReply(callDbId, callerNumber, recordingUrl, baseUrl)
      .then(responseXml => {
        void setReply(callDbId, responseXml);
        logger.info({ callDbId, callerHungUp }, 'AT reply cached');
        if (callerHungUp) {
          handleAtCallEnd(body).catch(() => null);
          if (sessionId) void deleteSessionCall(sessionId);
        }
      })
      .catch(err => {
        logger.error({ err, callDbId }, 'Background AT voice processing error');
        void setReply(callDbId, xml(`<Say>${escapeXml('I am sorry, I encountered an error. Please try again.')}</Say><Hangup></Hangup>`));
        if (callerHungUp) {
          handleAtCallEnd(body).catch(() => null);
          if (sessionId) void deleteSessionCall(sessionId);
        }
      });

    // Immediately acknowledge and hold while AI processes
    return res.send(xml(`<Say>${escapeXml('Got it, one moment please.')}</Say>` + holdRecord(baseUrl)));
  }

  // ── Call ended (no recording) ─────────────────────────────────────────────
  if (isActive === '0') {
    await handleAtCallEnd(body);
    if (sessionId) await deleteSessionCall(sessionId);
    return res.send(xml(''));
  }

  // ── Silent turn: no audio recorded, caller still on line ─────────────────
  // Happens when maxLength elapses without voice (sessionId present in our map)
  if (sessionId) {
    const callDbId = await getSessionCall(sessionId);
    if (callDbId) {
      return res.send(xml(
        `<Say>${escapeXml("I'm still here. Please go ahead and speak after the beep.")}</Say>` +
        recordTurn(15, baseUrl),
      ));
    }
  }

  // ── New inbound call ──────────────────────────────────────────────────────
  try {
    const normalizedDest = destinationNumber?.trim();

    let phoneRow = (await db
      .select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, normalizedDest))
      .limit(1))[0];

    if (!phoneRow && normalizedDest) {
      const alt = normalizedDest.startsWith('+') ? normalizedDest.slice(1) : `+${normalizedDest}`;
      phoneRow = (await db
        .select({ businessId: phoneNumbers.businessId })
        .from(phoneNumbers)
        .where(eq(phoneNumbers.number, alt))
        .limit(1))[0];
    }

    if (!phoneRow) {
      logger.warn({ destinationNumber, callerNumber }, 'AT call to unregistered number');
      return res.send(xml(`<Say>${escapeXml('This number is not configured. Goodbye.')}</Say><Hangup></Hangup>`));
    }

    const { businessId } = phoneRow;

    const [[agentRow], [bizRow], [kbRow]] = await Promise.all([
      db.select().from(agentConfigs).where(eq(agentConfigs.businessId, businessId)).limit(1),
      db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
      db.select({ operatingHours: knowledgeBases.operatingHours }).from(knowledgeBases).where(eq(knowledgeBases.businessId, businessId)).limit(1),
    ]);

    const greeting = agentRow?.greeting ?? `Hello, thank you for calling ${bizRow?.name ?? 'us'}. How can I help you today?`;
    const enableRecording = agentRow?.enableRecording ?? true;
    const maxDuration = agentRow?.maxCallDuration ?? 600;
    const turnSeconds = Math.min(15, maxDuration);
    const businessHoursOnly = agentRow?.businessHoursOnly ?? false;
    const afterHoursMessage = agentRow?.afterHoursMessage ?? 'We are currently closed. Please call back during business hours. Goodbye.';

    const [callRow] = await db.insert(calls).values({
      businessId,
      callerNumber: callerNumber ?? '',
      status: 'ACTIVE',
    }).returning({ id: calls.id });

    const callDbId = callRow?.id ?? '';

    // Store session → call mapping for all subsequent callbacks
    if (sessionId && callDbId) await setSessionCall(sessionId, callDbId);

    logger.info({ businessId, callerNumber, destinationNumber, sessionId, callDbId }, 'AT call answered');

    if (businessHoursOnly && kbRow?.operatingHours) {
      const now = new Date();
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = days[now.getDay()];
      const hours = kbRow.operatingHours as Record<string, string>;
      const todayHours = hours[currentDay];
      if (!todayHours || todayHours.toLowerCase() === 'closed') {
        return res.send(xml(`<Say>${escapeXml(afterHoursMessage)}</Say><Hangup></Hangup>`));
      }
      const [start, end] = todayHours.split('-');
      if (start && end) {
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        if (currentTime < startH * 60 + startM || currentTime > endH * 60 + endM) {
          return res.send(xml(`<Say>${escapeXml(afterHoursMessage)}</Say><Hangup></Hangup>`));
        }
      }
    }

    if (!enableRecording) {
      return res.send(xml(`<Say>${escapeXml(greeting)}</Say><Hangup></Hangup>`));
    }

    const script = `${greeting} Please speak after the beep, and stay on the line while I find an answer for you.`;
    const responseXml = xml(`<Say>${escapeXml(script)}</Say>` + recordTurn(turnSeconds, baseUrl));
    logger.info({ callDbId, xml: responseXml.slice(0, 400) }, 'AT voice response');
    return res.send(responseXml);

  } catch (err) {
    logger.error({ err, callerNumber, destinationNumber }, 'Error handling AT voice webhook');
    return res.send(xml(`<Say>${escapeXml('Sorry, we are experiencing technical difficulties. Please try again later.')}</Say><Hangup></Hangup>`));
  }
}

// POST /webhooks/at/voice/hold — polling callback while AI processes
export async function handleAtHoldWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const body = getAtPayload(req);
  const { sessionId, isActive } = body;

  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || 'https';
  const host = req.get('host');
  const baseUrl = host ? `${proto}://${host}` : env.API_URL.replace(/\/$/, '');

  const callDbId = sessionId ? await getSessionCall(sessionId) : null;

  if (!callDbId) {
    logger.warn({ sessionId }, 'AT hold callback: no session mapping');
    return res.send(xml('<Hangup></Hangup>'));
  }

  const cached = await popReply(callDbId);
  if (cached) {
    logger.info({ callDbId }, 'AT hold: serving cached reply');
    if (isActive === '0') {
      await handleAtCallEnd(body);
      if (sessionId) await deleteSessionCall(sessionId);
    }
    return res.send(cached);
  }

  // AI still computing — extend hold by another 2 seconds
  logger.info({ callDbId }, 'AT hold: still computing, extending');
  if (isActive === '0') {
    await handleAtCallEnd(body);
    if (sessionId) await deleteSessionCall(sessionId);
    return res.send(xml(''));
  }

  return res.send(xml(holdRecord(baseUrl)));
}

// POST /webhooks/at/voice/record — legacy separate recording endpoint (kept for compatibility)
export async function handleAtRecordingWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');
  // Delegate to main handler — it handles recording via sessionId map
  return handleAtVoiceWebhook(req, res);
}

async function handleAtCallEnd(body: Record<string, string>) {
  const { callerNumber, durationInSeconds, destinationNumber } = body;
  try {
    const businessId = await resolveBusinessIdByNumber(destinationNumber);
    const latestCallId = businessId ? await findLatestActiveCallId(businessId, callerNumber) : null;
    if (latestCallId) {
      await db.update(calls)
        .set({
          status: 'COMPLETED',
          // Keep existing resolution if already set (e.g. AI); only default to ABANDONED
          resolution: sql`COALESCE(${calls.resolution}, 'ABANDONED'::resolution_type)`,
          duration: parseInt(durationInSeconds ?? '0', 10),
          endedAt: new Date(),
        })
        .where(and(eq(calls.id, latestCallId), eq(calls.status, 'ACTIVE')));
    }
    logger.info({ callerNumber, durationInSeconds }, 'AT call ended');
  } catch (err) {
    logger.error({ err }, 'Error updating AT call on end');
  }
}

async function resolveBusinessIdByNumber(destinationNumber?: string): Promise<string | null> {
  const normalizedDest = destinationNumber?.trim();
  if (!normalizedDest) return null;

  let phoneRow = (await db
    .select({ businessId: phoneNumbers.businessId })
    .from(phoneNumbers)
    .where(eq(phoneNumbers.number, normalizedDest))
    .limit(1))[0];

  if (!phoneRow) {
    const alt = normalizedDest.startsWith('+') ? normalizedDest.slice(1) : `+${normalizedDest}`;
    phoneRow = (await db
      .select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, alt))
      .limit(1))[0];
  }

  return phoneRow?.businessId ?? null;
}

async function findLatestActiveCallId(businessId: string, callerNumber: string): Promise<string | null> {
  const [row] = await db.select({ id: calls.id }).from(calls)
    .where(and(
      eq(calls.businessId, businessId),
      eq(calls.callerNumber, callerNumber ?? ''),
      eq(calls.status, 'ACTIVE'),
    ))
    .orderBy(desc(calls.startedAt))
    .limit(1);
  return row?.id ?? null;
}
