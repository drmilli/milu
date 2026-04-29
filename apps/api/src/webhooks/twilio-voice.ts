import type { Request, Response } from 'express';
import crypto from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls, escalations, notifications, transcripts, knowledgeBases, knowledgeDocuments, businessSettings } from '../db';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { voiceChat, type ChatMessage } from '../services/document-extract';
import { sendEscalationAlert } from '../services/whatsapp';
import { notifyBusinessOwners } from '../services/notifications';
import { redis, ttsStoreSet } from '../utils/redis';

function twiml(body: string) {
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

function getBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ?? 'https';
  const host = req.get('host');
  return host ? `${proto}://${host}` : env.API_URL.replace(/\/$/, '');
}

type OpenAiTtsVoice = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

function mapAgentVoiceToOpenAi(voiceId: string | null | undefined): OpenAiTtsVoice {
  const v = (voiceId ?? '').toLowerCase().trim();
  if (v === 'alloy' || v === 'ash' || v === 'coral' || v === 'echo' || v === 'fable' || v === 'onyx' || v === 'nova' || v === 'sage' || v === 'shimmer') {
    return v;
  }
  if (v === 'amaka') return 'nova';
  if (v === 'chidi') return 'onyx';
  if (v === 'ngozi') return 'shimmer';
  return 'nova';
}

async function ttsUrl(text: string, voiceId: string | null | undefined, baseUrl: string): Promise<string | null> {
  if (!env.OPENAI_API_KEY) return null;

  const voice = mapAgentVoiceToOpenAi(voiceId);
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      format: 'mp3',
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    logger.warn({ status: res.status, err: err.slice(0, 200) }, 'OpenAI TTS failed');
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const id = crypto.randomUUID();
  const ttlSeconds = 5 * 60;
  if (redis) {
    await redis.set(`tts:${id}`, JSON.stringify({ ct: 'audio/mpeg', b64: buf.toString('base64') }), 'EX', ttlSeconds).catch(() => null);
  } else {
    ttsStoreSet(id, 'audio/mpeg', buf.toString('base64'), ttlSeconds);
  }
  return `${baseUrl.replace(/\/$/, '')}/webhooks/tts/${id}`;
}

function gatherTurn(callId: string, language: string, baseUrl: string, timeout = 5) {
  const action = `${baseUrl}/webhooks/twilio/voice/gather?callId=${encodeURIComponent(callId)}`;
  return `<Gather input="speech" action="${action}" method="POST" timeout="${timeout}" speechTimeout="auto" language="${language}"><Pause length="1"/></Gather>`;
}

export async function handleTwilioVoiceWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const toNumber = (req.body.To as string) || '';
  const fromNumber = (req.body.From as string) || '';
  const callSid = (req.body.CallSid as string) || '';

  logger.info({ toNumber, fromNumber, callSid }, 'Inbound Twilio call received');

  try {
    const [phoneRow] = await db
      .select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, toNumber))
      .limit(1)
      .then(async (rows) => {
        if (rows.length) return rows;
        return db.select({ businessId: phoneNumbers.businessId })
          .from(phoneNumbers)
          .where(eq(phoneNumbers.number, toNumber.replace(/^\+/, '')))
          .limit(1);
      });

    if (!phoneRow) {
      logger.warn({ toNumber, fromNumber }, 'Inbound call to unregistered number');
      return res.send(twiml('<Say voice="alice">This number is not configured. Goodbye.</Say><Hangup/>'));
    }

    const { businessId } = phoneRow;
    const baseUrl = getBaseUrl(req);

    const [[agentRow], [bizRow]] = await Promise.all([
      db.select().from(agentConfigs).where(eq(agentConfigs.businessId, businessId)).limit(1),
      db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    ]);

    const greeting = agentRow?.greeting ?? `Hello, thank you for calling ${bizRow?.name ?? 'us'}. How can I help you today?`;
    const businessHoursOnly = agentRow?.businessHoursOnly ?? false;
    const afterHoursMessage = agentRow?.afterHoursMessage ?? 'We are currently closed. Please call back during business hours. Goodbye.';
    const langMap: Record<string, string> = { en: 'en-US', yo: 'en-US', ig: 'en-US', ha: 'en-US', pcm: 'en-US' };
    const language = langMap[agentRow?.language ?? 'en'] ?? 'en-US';

    if (businessHoursOnly && false /* TODO: wire to per-business operating hours */) {
      return res.send(twiml(`<Say voice="alice" language="${language}">${escapeXml(afterHoursMessage)}</Say><Hangup/>`));
    }

    const [callRow] = await db.insert(calls).values({
      businessId,
      callerNumber: fromNumber,
      status: 'ACTIVE',
    }).returning({ id: calls.id });

    const callId = callRow?.id ?? '';
    logger.info({ businessId, fromNumber, toNumber, callSid, callId }, 'Inbound Twilio call answered');

    const audioUrl = await ttsUrl(greeting, agentRow?.voiceId ?? 'amaka', baseUrl);
    const speak = audioUrl
      ? `<Play>${escapeXml(audioUrl)}</Play>`
      : `<Say voice="alice" language="${language}">${escapeXml(greeting)}</Say>`;

    const xml = twiml(speak + gatherTurn(callId, language, baseUrl));
    return res.send(xml);
  } catch (err) {
    logger.error({ err, toNumber, fromNumber }, 'Error handling Twilio voice webhook');
    return res.send(twiml('<Say voice="alice">Sorry, we are experiencing technical difficulties. Please try again later.</Say><Hangup/>'));
  }
}

export async function handleTwilioVoiceGather(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const callId = typeof req.query.callId === 'string' ? req.query.callId : '';
  const speechResult = (req.body.SpeechResult as string | undefined) ?? '';
  const language = 'en-US';
  const baseUrl = getBaseUrl(req);

  logger.info({ callId, speechResult: speechResult.slice(0, 200) }, 'Twilio voice gather input');

  const retry = twiml(
    `<Say voice="alice" language="${language}">${escapeXml("Sorry, I didn't catch that. Could you please repeat?")}</Say>` +
    gatherTurn(callId, language, baseUrl),
  );

  if (!callId || !speechResult.trim()) return res.send(retry);

  try {
    const [callRow] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!callRow) {
      logger.warn({ callId }, 'Twilio gather: call not found');
      return res.send(twiml('<Say voice="alice">Something went wrong. Goodbye.</Say><Hangup/>'));
    }

    const [history, [agentRow], [bizRow], [kbRow], kbDocs] = await Promise.all([
      db.select({ speaker: transcripts.speaker, text: transcripts.text })
        .from(transcripts)
        .where(eq(transcripts.callId, callId))
        .orderBy(transcripts.createdAt),
      db.select().from(agentConfigs).where(eq(agentConfigs.businessId, callRow.businessId)).limit(1),
      db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, callRow.businessId)).limit(1),
      db.select({ faqs: knowledgeBases.faqs, websiteSummary: knowledgeBases.websiteSummary, escalationNumber: knowledgeBases.escalationNumber })
        .from(knowledgeBases).where(eq(knowledgeBases.businessId, callRow.businessId)).limit(1),
      db.select({ summary: knowledgeDocuments.summary })
        .from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, callRow.businessId)).limit(5),
    ]);

    await db.insert(transcripts).values({ callId, speaker: 'caller', text: speechResult });

    const messages: ChatMessage[] = [
      ...history.map(t => ({
        role: (t.speaker === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: t.text,
      })),
      { role: 'user' as const, content: speechResult },
    ];

    const { reply, action } = await voiceChat(messages, {
      businessName: bizRow?.name ?? 'this business',
      faqs: (kbRow?.faqs as { question: string; answer: string }[]) ?? [],
      websiteSummary: kbRow?.websiteSummary,
      docSummaries: kbDocs.map(d => d.summary ?? '').filter(Boolean),
      agentTone: agentRow?.tone,
      escalationNumber: kbRow?.escalationNumber,
    });

    await db.insert(transcripts).values({ callId, speaker: 'agent', text: reply });

    if (action === 'escalate') {
      await handleEscalation(callId, callRow.businessId, callRow.callerNumber ?? '', speechResult);
      await db.update(calls).set({ status: 'COMPLETED', resolution: 'HUMAN', endedAt: new Date() }).where(eq(calls.id, callId));
      return res.send(twiml(`<Say voice="alice" language="${language}">${escapeXml(reply)}</Say><Hangup/>`));
    }

    if (action === 'end') {
      await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() }).where(eq(calls.id, callId));
      const audioUrl = await ttsUrl(reply, agentRow?.voiceId ?? 'amaka', baseUrl);
      const speak = audioUrl
        ? `<Play>${escapeXml(audioUrl)}</Play>`
        : `<Say voice="alice" language="${language}">${escapeXml(reply)}</Say>`;
      return res.send(twiml(`${speak}<Hangup/>`));
    }

    const audioUrl = await ttsUrl(reply, agentRow?.voiceId ?? 'amaka', baseUrl);
    const speak = audioUrl
      ? `<Play>${escapeXml(audioUrl)}</Play>`
      : `<Say voice="alice" language="${language}">${escapeXml(reply)}</Say>`;
    return res.send(twiml(speak + gatherTurn(callId, language, baseUrl)));
  } catch (err) {
    logger.error({ err, callId }, 'Error handling Twilio voice gather');
    return res.send(retry);
  }
}

async function handleEscalation(callId: string, businessId: string, callerNumber: string, summary: string) {
  const [existing] = await db.select({ id: escalations.id }).from(escalations).where(eq(escalations.callId, callId)).limit(1);
  if (!existing) {
    await db.insert(escalations).values({ businessId, callId, reason: 'Agent escalation', summary: summary.slice(0, 600) });
  }
  const [settings] = await db.select({ whatsappNumber: businessSettings.whatsappNumber, whatsappVerified: businessSettings.whatsappVerified })
    .from(businessSettings).where(eq(businessSettings.businessId, businessId)).limit(1);
  if (settings?.whatsappVerified && settings.whatsappNumber) {
    await sendEscalationAlert(settings.whatsappNumber, callerNumber, summary).catch(() => null);
  }
  await notifyBusinessOwners(businessId, 'Call Escalated', `Caller ${callerNumber} needs your attention. ${summary}`);
}

export async function handleTwilioVoiceEnd(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const fromNumber = (req.body.From as string) || '';
  const toNumber = (req.body.To as string) || '';
  const callDuration = parseInt(req.body.CallDuration ?? '0', 10);
  const callId = typeof req.query.callId === 'string' && req.query.callId ? req.query.callId : null;

  try {
    const idToUpdate = callId ?? await findLatestActiveCallIdByNumber(toNumber, fromNumber);
    if (idToUpdate) {
      await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', duration: callDuration, endedAt: new Date() })
        .where(and(eq(calls.id, idToUpdate), eq(calls.status, 'ACTIVE')));
    }
    logger.info({ fromNumber, toNumber, callDuration }, 'Twilio call ended');
  } catch (err) {
    logger.error({ err }, 'Error handling Twilio call end');
  }

  return res.send(twiml('<Hangup/>'));
}

export async function handleTwilioVoiceStatus(req: Request, res: Response) {
  res.sendStatus(200);
  const body = req.body as Record<string, unknown>;
  logger.info({
    callSid: body.CallSid,
    callStatus: body.CallStatus,
    to: body.To ? maskPhone(body.To as string) : undefined,
    from: body.From ? maskPhone(body.From as string) : undefined,
    direction: body.Direction,
    duration: body.CallDuration ?? null,
  }, 'Twilio voice status');
}

function maskPhone(value: string) {
  const cleaned = value.replace(/^whatsapp:/, '');
  const last4 = cleaned.slice(-4);
  const maskedPrefix = cleaned.slice(0, Math.max(0, cleaned.length - 4)).replace(/\d/g, '*');
  return `${maskedPrefix}${last4}`;
}

async function findLatestActiveCallIdByNumber(toNumber: string, fromNumber: string): Promise<string | null> {
  const [phoneRow] = await db.select({ businessId: phoneNumbers.businessId })
    .from(phoneNumbers).where(eq(phoneNumbers.number, toNumber)).limit(1);
  if (!phoneRow) return null;
  const [row] = await db.select({ id: calls.id }).from(calls)
    .where(and(eq(calls.businessId, phoneRow.businessId), eq(calls.callerNumber, fromNumber), eq(calls.status, 'ACTIVE')))
    .orderBy(desc(calls.startedAt)).limit(1);
  return row?.id ?? null;
}

export async function handleTwilioMessageStatus(req: Request, res: Response) {
  res.sendStatus(200);
  const body = req.body as Record<string, unknown>;
  const messageSid = (body.MessageSid as string | undefined) ?? (body.SmsSid as string | undefined) ?? '';
  const messageStatus = (body.MessageStatus as string | undefined) ?? (body.SmsStatus as string | undefined) ?? '';
  const errorCode = body.ErrorCode as string | number | undefined;
  const errorMessage = body.ErrorMessage as string | undefined;

  logger.info({
    sid: messageSid,
    status: messageStatus,
    to: body.To ? maskPhone(body.To as string) : undefined,
    from: body.From ? maskPhone(body.From as string) : undefined,
    errorCode: errorCode ?? null,
    errorMessage: errorMessage ?? null,
  }, 'Twilio message status');

  if (!messageSid) return;
  const normalized = messageStatus.toLowerCase();
  const status = (normalized === 'delivered' || normalized === 'sent' || normalized === 'read') ? 'SENT'
    : (normalized === 'failed' || normalized === 'undelivered') ? 'FAILED' : null;

  try {
    await db.update(notifications)
      .set({
        ...(status ? { status } : {}),
        data: sql`${notifications.data} || ${JSON.stringify({ twilioStatus: messageStatus, errorCode: errorCode ?? null, errorMessage: errorMessage ?? null })}::jsonb`,
      } as any)
      .where(sql`${notifications.data}->>'twilioSid' = ${messageSid}`);
  } catch (err) {
    logger.error({ err, messageSid }, 'Failed to update WhatsApp notification status');
  }
}

export async function handleTwilioIncomingMessage(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>;
  const messageSid = (body.MessageSid as string | undefined) ?? '';
  const to = (body.To as string | undefined) ?? '';
  const from = (body.From as string | undefined) ?? '';
  const text = (body.Body as string | undefined) ?? '';

  logger.info({
    sid: messageSid,
    to: to ? maskPhone(to) : undefined,
    from: from ? maskPhone(from) : undefined,
    textPreview: text ? `${text.slice(0, 140)}${text.length > 140 ? '…' : ''}` : '',
  }, 'Twilio incoming WhatsApp message');

  try {
    // Find which business this number belongs to
    const numberRaw = to.replace(/^whatsapp:/, '');
    const [phoneRow] = await db.select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers).where(eq(phoneNumbers.number, numberRaw)).limit(1);

    await db.insert(notifications).values({
      channel: 'WHATSAPP',
      status: 'SENT',
      title: 'Incoming WhatsApp',
      body: text,
      recipient: from,
      businessId: phoneRow?.businessId ?? null,
      data: {
        direction: 'inbound',
        twilioSid: messageSid,
        from,
        to,
      },
    });
  } catch (err) {
    logger.error({ err, messageSid }, 'Failed to persist incoming WhatsApp message');
  }

  return res.sendStatus(200);
}

export async function handleTwilioIncomingMessageFallback(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>;
  logger.warn({
    sid: body.MessageSid,
    to: body.To ? maskPhone(body.To as string) : undefined,
    from: body.From ? maskPhone(body.From as string) : undefined,
    errorCode: body.ErrorCode ?? null,
  }, 'Twilio incoming message fallback');
  return res.sendStatus(200);
}
