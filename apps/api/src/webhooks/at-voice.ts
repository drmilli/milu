import type { Request, Response } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, businessSettings, calls, escalations, knowledgeBases, knowledgeDocuments, transcripts, contacts, orders, appointments, catalogItems } from '../db';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { voiceChat, type ChatMessage } from '../services/document-extract';
import { transcribeRecordingSnippet } from '../services/transcription';
import { notifyBusinessOwners } from '../services/notifications';
import { sendEscalationAlert } from '../services/whatsapp';
import crypto from 'crypto';
import { redis, ttsStoreSet } from '../utils/redis';

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

type OpenAiTtsVoice = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

function mapAgentVoiceToOpenAi(voiceId: string | null | undefined): OpenAiTtsVoice {
  const v = (voiceId ?? '').toLowerCase().trim();
  if (v === 'alloy' || v === 'ash' || v === 'coral' || v === 'echo' || v === 'fable' || v === 'onyx' || v === 'nova' || v === 'sage' || v === 'shimmer') {
    return v;
  }
  if (v === 'amaka') return 'nova';
  if (v === 'chidi') return 'onyx';
  if (v === 'ngozi') return 'shimmer';
  if (v === 'aisha') return 'alloy';
  if (v === 'tunde') return 'echo';
  if (v === 'kola') return 'ash';
  return 'nova';
}

function isUrgent(text: string) {
  const t = text.toLowerCase();
  return /\b(urgent|emergency|asap|immediately|right now|right away)\b/.test(t);
}

type EffectivePlan = {
  billingTier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  isTrial: boolean;
  features: { ops: boolean; whatsappNotifications: boolean };
};

function trialEndsAt(createdAt: Date) {
  return new Date(createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);
}

function buildPlanFromBusinessRow(biz: { subscriptionTier: string | null; createdAt: Date }): EffectivePlan {
  const billingTier = (biz.subscriptionTier ?? 'STARTER') as 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  const now = new Date();
  const isTrial = billingTier === 'STARTER' && now < trialEndsAt(biz.createdAt);
  const tier: EffectivePlan['tier'] = isTrial ? 'GROWTH' : billingTier;
  if (tier === 'STARTER') return { billingTier, tier, isTrial, features: { ops: false, whatsappNotifications: false } };
  if (tier === 'GROWTH') return { billingTier, tier, isTrial, features: { ops: true, whatsappNotifications: true } };
  return { billingTier, tier: 'ENTERPRISE', isTrial: false, features: { ops: true, whatsappNotifications: true } };
}

function extractCatalogSearchTerm(text: string): string {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const stop = new Set([
    'do', 'you', 'have', 'got', 'is', 'are', 'the', 'a', 'an', 'any', 'available', 'availability', 'in', 'stock',
    'please', 'tell', 'me', 'your', 'our', 'what', 'which', 'how', 'much', 'price', 'cost', 'for', 'of', 'on',
    'menu', 'product', 'products', 'service', 'services', 'sell', 'selling', 'today', 'now',
  ]);
  const tokens = cleaned.split(/\s+/).filter(w => w.length >= 3 && !stop.has(w));
  return tokens.join(' ').trim();
}

async function buildCatalogSummary(businessId: string, queryText: string): Promise<string | null> {
  try {
    const term = extractCatalogSearchTerm(queryText);
    const conditions: any[] = [eq(catalogItems.businessId, businessId)];

    if (term) {
      const like = `%${term}%`;
      conditions.push(sql`(${catalogItems.name} ILIKE ${like} OR coalesce(${catalogItems.description}, '') ILIKE ${like})`);
    }

    const rows = await db.select({
      type: catalogItems.type,
      name: catalogItems.name,
      description: catalogItems.description,
      price: catalogItems.price,
      currency: catalogItems.currency,
      isAvailable: catalogItems.isAvailable,
      availabilityNote: catalogItems.availabilityNote,
      updatedAt: catalogItems.updatedAt,
    })
      .from(catalogItems)
      .where(and(...conditions))
      .orderBy(desc(catalogItems.updatedAt))
      .limit(term ? 12 : 20);

    if (!rows.length) {
      if (!term) return null;
      return `No catalog matches found for: "${term}".`;
    }

    const available = rows.filter(r => r.isAvailable).slice(0, 10);
    const unavailable = rows.filter(r => !r.isAvailable).slice(0, 6);

    const line = (r: typeof rows[number]) => {
      const price = typeof r.price === 'number' ? ` — ${r.currency} ${r.price}` : '';
      const status = r.isAvailable ? 'Available' : 'Unavailable';
      const note = r.availabilityNote ? ` (${r.availabilityNote})` : '';
      return `${r.type}: ${r.name}${price} — ${status}${note}`;
    };

    const sections: string[] = [];
    if (available.length) sections.push(`Available:\n${available.map(line).join('\n')}`);
    if (unavailable.length) sections.push(`Unavailable:\n${unavailable.map(line).join('\n')}`);
    return sections.join('\n\n');
  } catch (err) {
    logger.warn({ err }, 'Failed to build catalog summary');
    return null;
  }
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

  const [history, [agentRow], [bizRow], [kbRow], kbDocs, catalogSummary] = await Promise.all([
    db.select({ speaker: transcripts.speaker, text: transcripts.text })
      .from(transcripts)
      .where(eq(transcripts.callId, callDbId))
      .orderBy(desc(transcripts.createdAt))
      .limit(20),
    db.select().from(agentConfigs).where(eq(agentConfigs.businessId, callRow.businessId)).limit(1),
    db.select({ name: businesses.name, subscriptionTier: businesses.subscriptionTier, createdAt: businesses.createdAt })
      .from(businesses).where(eq(businesses.id, callRow.businessId)).limit(1),
    db.select({
      faqs: knowledgeBases.faqs,
      websiteSummary: knowledgeBases.websiteSummary,
      escalationNumber: knowledgeBases.escalationNumber,
    }).from(knowledgeBases).where(eq(knowledgeBases.businessId, callRow.businessId)).limit(1),
    db.select({ summary: knowledgeDocuments.summary })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.businessId, callRow.businessId))
      .limit(5),
    buildCatalogSummary(callRow.businessId, callerText),
  ]);

  await db.insert(transcripts).values({ callId: callDbId, speaker: 'caller', text: callerText });

  const messages: ChatMessage[] = [
    ...history.slice().reverse().map(t => ({
      role: (t.speaker === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: t.text,
    })),
    { role: 'user' as const, content: callerText },
  ];

  const urgent = isUrgent(callerText);
  const plan = bizRow?.createdAt ? buildPlanFromBusinessRow({ subscriptionTier: bizRow.subscriptionTier ?? null, createdAt: bizRow.createdAt }) : null;
  const {
    reply,
    action,
    appointment: appt,
    order,
  } = urgent
    ? { reply: 'I’ll get someone to help you right away.', action: 'escalate' as const, appointment: null, order: null }
    : await voiceChat(messages, {
      businessName: bizRow?.name ?? 'this business',
      agentName: agentRow?.name,
      agentLanguage: agentRow?.language,
      faqs: (kbRow?.faqs as { question: string; answer: string }[]) ?? [],
      websiteSummary: kbRow?.websiteSummary,
      docSummaries: kbDocs.map(d => d.summary ?? '').filter(Boolean),
      catalogSummary,
      agentTone: agentRow?.tone,
      escalationNumber: kbRow?.escalationNumber,
      fallbackMessage: agentRow?.fallbackMessage,
      opsEnabled: plan?.features.ops ?? true,
    });

  await db.insert(transcripts).values({ callId: callDbId, speaker: 'agent', text: reply });

  let contactId: string | undefined;
  const phone = callRow.callerNumber ?? '';
  if (phone) {
    const [existingContact] = await db.select({ id: contacts.id }).from(contacts)
      .where(and(eq(contacts.businessId, callRow.businessId), eq(contacts.phone, phone)))
      .limit(1);
    if (existingContact?.id) {
      contactId = existingContact.id;
      await db.update(contacts).set({ lastCallAt: new Date() })
        .where(eq(contacts.id, contactId));
    } else {
      const [created] = await db.insert(contacts).values({
        businessId: callRow.businessId,
        phone,
        name: appt?.customerName ?? order?.customerName,
        lastCallAt: new Date(),
      }).returning({ id: contacts.id });
      contactId = created?.id;
    }
  }

  if ((plan?.features.ops ?? true) && appt?.scheduledAt) {
    const scheduledAt = new Date(appt.scheduledAt);
    if (!Number.isNaN(scheduledAt.getTime())) {
      const [row] = await db.insert(appointments).values({
        businessId: callRow.businessId,
        contactId,
        callId: callDbId,
        scheduledAt,
        duration: Math.max(5, Math.min(240, appt.durationMinutes ?? 30)),
        serviceType: appt.serviceType,
        customerPhone: appt.customerPhone ?? phone,
        customerName: appt.customerName,
        notes: appt.notes,
      }).returning({ id: appointments.id });
      logger.info({ callDbId, appointmentId: row?.id }, 'Appointment created from call');
      await notifyBusinessOwners(callRow.businessId, 'New Appointment', `Booked for ${appt.customerName ?? appt.customerPhone ?? phone} on ${scheduledAt.toLocaleString()}`);
    }
  }

  if ((plan?.features.ops ?? true) && order?.items?.length) {
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const totalAmount = typeof order.totalAmount === 'number'
      ? Math.max(0, Math.round(order.totalAmount))
      : order.items.reduce((sum, it) => sum + (typeof it.price === 'number' ? it.price * it.qty : 0), 0) || undefined;
    const [row] = await db.insert(orders).values({
      businessId: callRow.businessId,
      contactId,
      callId: callDbId,
      orderNumber,
      customerPhone: order.customerPhone ?? phone,
      customerName: order.customerName,
      items: order.items.map(i => ({ name: i.name, qty: i.qty, price: i.price ?? 0 })),
      totalAmount,
      currency: order.currency ?? 'NGN',
      deliveryAddress: order.deliveryAddress,
      notes: order.notes,
    }).returning({ id: orders.id });
    logger.info({ callDbId, orderId: row?.id, orderNumber }, 'Order created from call');
    await notifyBusinessOwners(callRow.businessId, 'New Order', `Order #${orderNumber} from ${order.customerName ?? order.customerPhone ?? phone}`);
  }

  const speak = `<Say>${escapeXml(reply)}</Say>`;

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
    if ((plan?.features.whatsappNotifications ?? true) && settings?.whatsappVerified && settings.whatsappNumber) {
      await sendEscalationAlert(settings.whatsappNumber, callerNumber ?? callRow.callerNumber ?? '', summary).catch(() => null);
    }

    await notifyBusinessOwners(callRow.businessId, 'Call Escalated', `Caller ${callerNumber ?? callRow.callerNumber ?? ''} needs your attention. ${summary}`);
    await db.update(calls).set({ status: 'COMPLETED', resolution: 'HUMAN', endedAt: new Date() }).where(eq(calls.id, callDbId));

    return xml(`${speak}<Hangup></Hangup>`);
  }

  if (action === 'end') {
    await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() }).where(eq(calls.id, callDbId));
    return xml(`${speak}<Hangup></Hangup>`);
  }

  // Mark as AI-resolved once the agent successfully responds (don't overwrite HUMAN)
  await db.update(calls)
    .set({ resolution: 'AI' })
    .where(and(eq(calls.id, callDbId), isNull(calls.resolution)));

  return xml(speak + recordTurn(15, baseUrl));
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
    const callDbId = sessionId ? await getSessionCall(sessionId) : null;

    if (!callDbId) {
      logger.warn({ sessionId, callerNumber, destinationNumber }, 'AT recording: no session mapping found');
      return res.send(xml('<Hangup></Hangup>'));
    }

    logger.info({ callDbId, sessionId, isActive }, 'AT recording callback received');

    const callerHungUp = isActive === '0';

    const retry = xml(
      `<Say>${escapeXml("I'm sorry, I didn't quite catch that. Please go ahead and speak after the beep.")}</Say>` +
      recordTurn(15, baseUrl),
    );

    // Process inline — AT allows ~15s for webhook responses; AI typically takes 3–6s.
    // The hold-polling approach had a race condition where the session mapping was
    // deleted before the hold callback arrived, causing immediate hangup.
    let responseXml: string;
    try {
      responseXml = await Promise.race([
        computeAtVoiceReply(callDbId, callerNumber, recordingUrl, baseUrl),
        new Promise<string>(resolve => setTimeout(() => resolve(retry), 10000)),
      ]);
    } catch (err) {
      logger.error({ err, callDbId }, 'AT voice processing error');
      responseXml = retry;
    }

    if (callerHungUp) {
      handleAtCallEnd(body).catch(() => null);
      if (sessionId) void deleteSessionCall(sessionId);
    }

    return res.send(responseXml);
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
    const greetSpeak = `<Say>${escapeXml(script)}</Say>`;
    const responseXml = xml(greetSpeak + recordTurn(turnSeconds, baseUrl));
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
