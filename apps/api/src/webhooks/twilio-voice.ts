import type { Request, Response } from 'express';
import crypto from 'crypto';
import twilio from 'twilio';
import { and, desc, eq, gte, ne, sql } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls, escalations, notifications, transcripts, knowledgeBases, knowledgeDocuments, businessSettings, contacts, orders, appointments, catalogItems } from '../db';
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
  features: {
    ops: boolean;
    callRecording: boolean;
    whatsappNotifications: boolean;
  };
  limits: {
    callsPerMonth: number | null;
  };
};

function trialEndsAt(createdAt: Date) {
  return new Date(createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);
}

function buildPlanFromBusinessRow(biz: { subscriptionTier: string | null; createdAt: Date }): EffectivePlan {
  const billingTier = (biz.subscriptionTier ?? 'STARTER') as 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  const now = new Date();
  const isTrial = billingTier === 'STARTER' && now < trialEndsAt(biz.createdAt);
  const tier: EffectivePlan['tier'] = isTrial ? 'GROWTH' : billingTier;

  if (tier === 'STARTER') {
    return {
      billingTier,
      tier,
      isTrial,
      features: { ops: false, callRecording: false, whatsappNotifications: false },
      limits: { callsPerMonth: 200 },
    };
  }
  if (tier === 'GROWTH') {
    return {
      billingTier,
      tier,
      isTrial,
      features: { ops: true, callRecording: true, whatsappNotifications: true },
      limits: { callsPerMonth: 500 },
    };
  }
  return {
    billingTier,
    tier: 'ENTERPRISE',
    isTrial: false,
    features: { ops: true, callRecording: true, whatsappNotifications: true },
    limits: { callsPerMonth: null },
  };
}

function getTwilioClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

function twilioBasicAuthHeader() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  const token = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

function twilioRecordingMediaUrl(recordingSid: string) {
  if (!env.TWILIO_ACCOUNT_SID) return null;
  return `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Recordings/${recordingSid}.mp3`;
}

function normalizeTwilioRecordingUrl(urlOrSid: string) {
  const v = urlOrSid.trim();
  if (!v) return null;
  if (v.startsWith('http')) {
    return v.endsWith('.mp3') ? v : `${v}.mp3`;
  }
  return twilioRecordingMediaUrl(v);
}

function cloudinaryEnabled() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function sha1Hex(input: string) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

async function uploadMp3ToCloudinary(callId: string, bytes: Uint8Array) {
  if (!cloudinaryEnabled()) return null;

  const cloudName = env.CLOUDINARY_CLOUD_NAME as string;
  const apiKey = env.CLOUDINARY_API_KEY as string;
  const apiSecret = env.CLOUDINARY_API_SECRET as string;
  const folder = (env.CLOUDINARY_FOLDER?.trim() || 'milu/calls').replace(/\/+$/, '');
  const timestamp = Math.floor(Date.now() / 1000);

  const paramsToSign: Record<string, string> = {
    folder,
    overwrite: 'true',
    public_id: callId,
    timestamp: String(timestamp),
  };

  const toSign = Object.keys(paramsToSign)
    .sort()
    .map(k => `${k}=${paramsToSign[k]}`)
    .join('&');
  const signature = sha1Hex(`${toSign}${apiSecret}`);

  const body = new FormData();
  body.append('file', new Blob([bytes], { type: 'audio/mpeg' }), `${callId}.mp3`);
  body.append('api_key', apiKey);
  body.append('timestamp', String(timestamp));
  body.append('signature', signature);
  body.append('folder', folder);
  body.append('public_id', callId);
  body.append('overwrite', 'true');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    logger.warn({ status: res.status, err: err.slice(0, 300) }, 'Cloudinary upload failed');
    return null;
  }

  const json = await res.json().catch(() => null) as { secure_url?: string } | null;
  return json?.secure_url ?? null;
}

async function fetchTwilioRecordingBytes(mediaUrl: string): Promise<Uint8Array | null> {
  const auth = twilioBasicAuthHeader();
  if (!auth) return null;

  const res = await fetch(mediaUrl, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    logger.warn({ status: res.status, err: err.slice(0, 200) }, 'Failed to download Twilio recording');
    return null;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return new Uint8Array(buf);
}

function isCatalogQuestion(text: string) {
  const t = text.toLowerCase();
  return /\b(available|availability|in stock|do you have|have you got|price|cost|how much|menu|product|products|service|services|sell|selling)\b/.test(t);
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
      instructions: 'Speak naturally and warmly, like a friendly and attentive customer service agent. Use a conversational tone with natural rhythm — not flat or robotic. Keep energy calm but engaged.',
      speed: 0.95,
    }),
    signal: AbortSignal.timeout(8000),
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

const twilioTwimlCache = new Map<string, { xml: string; expiresAt: number }>();

function sayTag(text: string, language: string) {
  return `<Say voice="alice" language="${language}">${escapeXml(text)}</Say>`;
}

function playTag(url: string) {
  return `<Play>${escapeXml(url)}</Play>`;
}

async function speakTag(
  text: string,
  voiceId: string | null | undefined,
  language: string,
  baseUrl: string,
  timeoutMs: number,
) {
  const trimmed = text.trim();
  const short = trimmed.length > 700 ? trimmed.slice(0, 700) : trimmed;

  if (!env.OPENAI_API_KEY) return sayTag(short, language);

  const url = await Promise.race<string | null>([
    ttsUrl(short, voiceId, baseUrl),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);

  return url ? playTag(url) : sayTag(short, language);
}

function twilioCacheSet(callId: string, xml: string) {
  twilioTwimlCache.set(callId, { xml, expiresAt: Date.now() + 2 * 60 * 1000 });
}

function twilioCachePop(callId: string): string | null {
  const hit = twilioTwimlCache.get(callId);
  if (!hit) return null;
  twilioTwimlCache.delete(callId);
  if (Date.now() > hit.expiresAt) return null;
  return hit.xml;
}

async function twilioCacheSetPersistent(callId: string, xml: string) {
  if (redis) {
    await redis.set(`twilio:twiml:${callId}`, xml, 'EX', 120).catch(() => null);
    return;
  }
  twilioCacheSet(callId, xml);
}

async function twilioCachePopPersistent(callId: string): Promise<string | null> {
  if (redis) {
    const key = `twilio:twiml:${callId}`;
    const res = await redis.multi().get(key).del(key).exec().catch(() => null);
    const value = Array.isArray(res) ? (res[0]?.[1] as string | null | undefined) : null;
    if (typeof value === 'string' && value) return value;
    return null;
  }
  return twilioCachePop(callId);
}

function gatherTurn(callId: string, language: string, baseUrl: string, timeout = 4) {
  const action = `${baseUrl}/webhooks/twilio/voice/gather?callId=${encodeURIComponent(callId)}`;
  return `<Gather input="speech" action="${action}" method="POST" timeout="${timeout}" speechTimeout="1" language="${language}"></Gather>`;
}

function parseProfileText(input: string) {
  const raw = input.trim();
  const cleaned = raw.replace(/\s+/g, ' ');
  const lower = cleaned.toLowerCase();

  const fromMatch = cleaned.match(/\b(from|in)\b\s+(.+)$/i);
  const location = fromMatch?.[2]?.trim().replace(/^[,.\-:\s]+/, '').replace(/[.?!]+$/, '') ?? '';

  let namePart = cleaned;
  if (fromMatch?.index != null) namePart = cleaned.slice(0, fromMatch.index).trim();

  namePart = namePart
    .replace(/^(my name is|i am|i'm|this is)\b/i, '')
    .trim()
    .replace(/^[,.\-:\s]+/, '')
    .replace(/[.?!]+$/, '');

  const nameTokens = namePart.split(' ').filter(Boolean).slice(0, 3);
  const name = nameTokens.join(' ').trim();

  const locTokens = location.split(' ').filter(Boolean).slice(0, 4);
  const loc = locTokens.join(' ').trim();

  return { name: name || null, location: loc || null };
}

function redirectToRespond(callId: string, baseUrl: string, attempt: number) {
  const url = `${baseUrl}/webhooks/twilio/voice/respond?callId=${encodeURIComponent(callId)}&attempt=${attempt}`;
  return `<Redirect method="POST">${escapeXml(url)}</Redirect>`;
}

async function computeTwilioTurn(callId: string, speechResult: string, baseUrl: string) {
  const language = 'en-US';

  const [callRow] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!callRow) {
    return twiml('<Say voice="alice">Something went wrong. Goodbye.</Say><Hangup/>');
  }

  const [history, [agentRow], [bizRow], [kbRow], kbDocs, catalogSummary, [contactRow], previousSnippets] = await Promise.all([
    db.select({ speaker: transcripts.speaker, text: transcripts.text })
      .from(transcripts)
      .where(eq(transcripts.callId, callId))
      .orderBy(desc(transcripts.createdAt))
      .limit(20),
    db.select().from(agentConfigs).where(eq(agentConfigs.businessId, callRow.businessId)).limit(1),
    db.select({ name: businesses.name, subscriptionTier: businesses.subscriptionTier, createdAt: businesses.createdAt })
      .from(businesses).where(eq(businesses.id, callRow.businessId)).limit(1),
    db.select({ faqs: knowledgeBases.faqs, websiteSummary: knowledgeBases.websiteSummary, escalationNumber: knowledgeBases.escalationNumber })
      .from(knowledgeBases).where(eq(knowledgeBases.businessId, callRow.businessId)).limit(1),
    db.select({ summary: knowledgeDocuments.summary })
      .from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, callRow.businessId)).limit(5),
    buildCatalogSummary(callRow.businessId, speechResult),
    callRow.contactId
      ? db.select({ id: contacts.id, name: contacts.name, location: contacts.location, totalCalls: contacts.totalCalls })
        .from(contacts).where(eq(contacts.id, callRow.contactId)).limit(1)
      : db.select({ id: contacts.id, name: contacts.name, location: contacts.location, totalCalls: contacts.totalCalls })
        .from(contacts).where(and(eq(contacts.businessId, callRow.businessId), eq(contacts.phone, callRow.callerNumber))).limit(1),
    callRow.callerNumber
      ? db.select({ speaker: transcripts.speaker, text: transcripts.text, createdAt: transcripts.createdAt })
        .from(transcripts)
        .leftJoin(calls, eq(calls.id, transcripts.callId))
        .where(and(
          eq(calls.businessId, callRow.businessId),
          eq(calls.callerNumber, callRow.callerNumber),
          ne(calls.id, callId),
        ))
        .orderBy(desc(transcripts.createdAt))
        .limit(8)
      : Promise.resolve([] as { speaker: string; text: string; createdAt: Date }[]),
  ]);

  const messages: ChatMessage[] = [
    ...history.slice().reverse().map(t => ({
      role: (t.speaker === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: t.text,
    })),
    { role: 'user' as const, content: speechResult },
  ];

  const urgent = isUrgent(speechResult);
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
      callerNumber: callRow.callerNumber ?? null,
      callerName: callRow.callerName ?? contactRow?.name ?? null,
      callerLocation: callRow.callerLocation ?? contactRow?.location ?? null,
      previousCallerSnippets: previousSnippets.slice().reverse().map(s => `${s.speaker}: ${s.text}`),
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

  await db.insert(transcripts).values({ callId, speaker: 'agent', text: reply });

  const phone = callRow.callerNumber ?? '';
  const contactId = callRow.contactId ?? contactRow?.id;
  if (contactId) {
    const update: Record<string, unknown> = { lastCallAt: new Date(), updatedAt: new Date() };
    if (!contactRow?.name && (appt?.customerName || order?.customerName)) update.name = appt?.customerName ?? order?.customerName;
    await db.update(contacts).set(update as any).where(eq(contacts.id, contactId)).catch(() => null);
    await db.update(calls).set({ contactId }).where(and(eq(calls.id, callId), sql`${calls.contactId} is null`)).catch(() => null);
  }

  if ((plan?.features.ops ?? true) && appt?.scheduledAt) {
    const scheduledAt = new Date(appt.scheduledAt);
    if (!Number.isNaN(scheduledAt.getTime())) {
      const [row] = await db.insert(appointments).values({
        businessId: callRow.businessId,
        contactId,
        callId,
        scheduledAt,
        duration: Math.max(5, Math.min(240, appt.durationMinutes ?? 30)),
        serviceType: appt.serviceType,
        customerPhone: appt.customerPhone ?? phone,
        customerName: appt.customerName,
        notes: appt.notes,
      }).returning({ id: appointments.id });
      logger.info({ callId, appointmentId: row?.id }, 'Appointment created from call');
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
      callId,
      orderNumber,
      customerPhone: order.customerPhone ?? phone,
      customerName: order.customerName,
      items: order.items.map(i => ({ name: i.name, qty: i.qty, price: i.price ?? 0 })),
      totalAmount,
      currency: order.currency ?? 'NGN',
      deliveryAddress: order.deliveryAddress,
      notes: order.notes,
    }).returning({ id: orders.id });
    logger.info({ callId, orderId: row?.id, orderNumber }, 'Order created from call');
    await notifyBusinessOwners(callRow.businessId, 'New Order', `Order #${orderNumber} from ${order.customerName ?? order.customerPhone ?? phone}`);
  }

  if (action === 'escalate') {
    await handleEscalation(callId, callRow.businessId, callRow.callerNumber ?? '', speechResult);
    await db.update(calls).set({ status: 'COMPLETED', resolution: 'HUMAN', endedAt: new Date() }).where(eq(calls.id, callId));
    const speak = await speakTag(reply, agentRow?.voiceId, language, baseUrl, 2500);
    return twiml(`${speak}<Hangup/>`);
  }

  if (action === 'end') {
    await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() }).where(eq(calls.id, callId));
    const speak = await speakTag(reply, agentRow?.voiceId, language, baseUrl, 2500);
    return twiml(`${speak}<Hangup/>`);
  }

  const speak = await speakTag(reply, agentRow?.voiceId, language, baseUrl, 2500);
  return twiml(speak + gatherTurn(callId, language, baseUrl));
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
      db.select({ name: businesses.name, subscriptionTier: businesses.subscriptionTier, createdAt: businesses.createdAt })
        .from(businesses).where(eq(businesses.id, businessId)).limit(1),
    ]);

    if (bizRow?.createdAt) {
      const plan = buildPlanFromBusinessRow({ subscriptionTier: bizRow.subscriptionTier ?? null, createdAt: bizRow.createdAt });
      if (plan.limits.callsPerMonth != null) {
        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        const [count] = await db.select({ n: sql<number>`count(*)` }).from(calls)
          .where(and(eq(calls.businessId, businessId), gte(calls.startedAt, startOfMonth)));
        if (Number(count?.n ?? 0) >= plan.limits.callsPerMonth) {
          const msg = 'Sorry, this business has reached its monthly call limit. Please call again later.';
          return res.send(twiml(`<Say voice="alice">${escapeXml(msg)}</Say><Hangup/>`));
        }
      }
    }

    const baseGreeting = agentRow?.greeting ?? `Hello, thank you for calling ${bizRow?.name ?? 'us'}.`;
    const businessHoursOnly = agentRow?.businessHoursOnly ?? false;
    const afterHoursMessage = agentRow?.afterHoursMessage ?? 'We are currently closed. Please call back during business hours. Goodbye.';
    const langMap: Record<string, string> = { en: 'en-US', yo: 'en-US', ig: 'en-US', ha: 'en-US', pcm: 'en-US' };
    const language = langMap[agentRow?.language ?? 'en'] ?? 'en-US';

    if (businessHoursOnly && false /* TODO: wire to per-business operating hours */) {
      return res.send(twiml(`<Say voice="alice" language="${language}">${escapeXml(afterHoursMessage)}</Say><Hangup/>`));
    }

    const now = new Date();
    let contactRow: { id: string; name: string | null; location: string | null; totalCalls: number } | undefined;
    const [existingContact] = await db.select({
      id: contacts.id,
      name: contacts.name,
      location: contacts.location,
      totalCalls: contacts.totalCalls,
    }).from(contacts).where(and(eq(contacts.businessId, businessId), eq(contacts.phone, fromNumber))).limit(1);

    if (existingContact) {
      contactRow = {
        id: existingContact.id,
        name: existingContact.name ?? null,
        location: existingContact.location ?? null,
        totalCalls: existingContact.totalCalls ?? 0,
      };
      await db.update(contacts).set({
        totalCalls: (contactRow.totalCalls ?? 0) + 1,
        lastCallAt: now,
        updatedAt: now,
      }).where(eq(contacts.id, contactRow.id));
    } else {
      const [created] = await db.insert(contacts).values({
        businessId,
        phone: fromNumber,
        totalCalls: 1,
        lastCallAt: now,
      }).returning({ id: contacts.id, name: contacts.name, location: contacts.location, totalCalls: contacts.totalCalls });
      if (created) {
        contactRow = {
          id: created.id,
          name: created.name ?? null,
          location: created.location ?? null,
          totalCalls: created.totalCalls ?? 1,
        };
      }
    }

    const needsName = !contactRow?.name;
    const needsLocation = !contactRow?.location;
    const awaitingProfile = needsName || needsLocation;
    const profilePrompt = needsName && needsLocation
      ? "What's your name, and where are you calling from?"
      : needsName
        ? "What's your name?"
        : "Where are you calling from?";

    const greeting = awaitingProfile
      ? `${baseGreeting} ${profilePrompt}`
      : (contactRow?.name && contactRow?.location)
        ? `Hi ${contactRow.name}. Thanks for calling from ${contactRow.location}. How can I help you today?`
        : `${baseGreeting} How can I help you today?`;

    const [callRow] = await db.insert(calls).values({
      businessId,
      contactId: contactRow?.id ?? null,
      callerNumber: fromNumber,
      callerName: contactRow?.name ?? null,
      callerLocation: contactRow?.location ?? null,
      awaitingProfile,
      status: 'ACTIVE',
    }).returning({ id: calls.id });

    const callId = callRow?.id ?? '';
    logger.info({ businessId, fromNumber, toNumber, callSid, callId }, 'Inbound Twilio call answered');

    const enableRecording = agentRow?.enableRecording ?? true;
    const plan = bizRow?.createdAt ? buildPlanFromBusinessRow({ subscriptionTier: bizRow.subscriptionTier ?? null, createdAt: bizRow.createdAt }) : null;
    const canRecord = (plan?.features.callRecording ?? true) && enableRecording;
    const record = canRecord
      ? `<Start><Record recordingStatusCallback="${escapeXml(`${baseUrl}/webhooks/twilio/voice/recording?callId=${encodeURIComponent(callId)}`)}" recordingStatusCallbackMethod="POST" recordingChannels="dual" /></Start>`
      : '';

    await db.insert(transcripts).values({ callId, speaker: 'agent', text: greeting }).catch(() => null);

    const speak = await speakTag(greeting, agentRow?.voiceId, language, baseUrl, 1500);

    const xml = twiml(record + speak + gatherTurn(callId, language, baseUrl, awaitingProfile ? 6 : 4));
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
    sayTag("Sorry, I didn't catch that. Could you please repeat?", language) +
    gatherTurn(callId, language, baseUrl),
  );

  if (!callId || !speechResult.trim()) return res.send(retry);

  try {
    await db.insert(transcripts).values({ callId, speaker: 'caller', text: speechResult });

    const [callRow] = await db.select({
      businessId: calls.businessId,
      contactId: calls.contactId,
      callerNumber: calls.callerNumber,
      callerName: calls.callerName,
      callerLocation: calls.callerLocation,
      awaitingProfile: calls.awaitingProfile,
    }).from(calls).where(eq(calls.id, callId)).limit(1);

    if (callRow?.awaitingProfile) {
      const parsed = parseProfileText(speechResult);
      const finalName = (callRow.callerName ?? '').trim() ? callRow.callerName : parsed.name;
      const finalLocation = (callRow.callerLocation ?? '').trim() ? callRow.callerLocation : parsed.location;

      const stillNeedsName = !finalName;
      const stillNeedsLocation = !finalLocation;
      const stillAwaiting = stillNeedsName || stillNeedsLocation;

      const prompt = stillNeedsName
        ? "Thanks. What's your name?"
        : stillNeedsLocation
          ? `Thanks ${finalName}. Where are you calling from?`
          : `Thanks ${finalName} from ${finalLocation}. How can I help you today?`;

      await db.update(calls).set({
        callerName: finalName ?? null,
        callerLocation: finalLocation ?? null,
        awaitingProfile: stillAwaiting,
      }).where(eq(calls.id, callId));

      if (callRow.contactId) {
        const update: Record<string, unknown> = { updatedAt: new Date() };
        if (finalName) update.name = finalName;
        if (finalLocation) update.location = finalLocation;
        await db.update(contacts).set(update as any).where(eq(contacts.id, callRow.contactId)).catch(() => null);
      }

      await db.insert(transcripts).values({ callId, speaker: 'agent', text: prompt }).catch(() => null);
      const speak = await speakTag(prompt, null, language, baseUrl, 2000);
      return res.send(twiml(
        speak +
        gatherTurn(callId, language, baseUrl, stillAwaiting ? 6 : 4),
      ));
    }

    const compute = computeTwilioTurn(callId, speechResult, baseUrl)
      .then(async (xml) => {
        await twilioCacheSetPersistent(callId, xml);
        return xml;
      })
      .catch(async () => {
        await twilioCacheSetPersistent(callId, retry);
        return '';
      });

    const quick = await Promise.race<string | null>([
      compute,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
    ]);

    if (quick) return res.send(quick);
    return res.send(twiml(redirectToRespond(callId, baseUrl, 0)));
  } catch (err) {
    logger.error({ err, callId }, 'Error handling Twilio voice gather');
    return res.send(retry);
  }
}

export async function handleTwilioVoiceRespond(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const callId = typeof req.query.callId === 'string' ? req.query.callId : '';
  const attempt = typeof req.query.attempt === 'string' ? parseInt(req.query.attempt, 10) : 0;
  const baseUrl = getBaseUrl(req);
  const language = 'en-US';

  if (!callId) return res.send(twiml('<Hangup/>'));

  const cached = await twilioCachePopPersistent(callId);
  if (cached) return res.send(cached);

  if (Number.isFinite(attempt) && attempt >= 8) {
    return res.send(twiml(
      sayTag("Sorry, I'm taking longer than expected. Please say that again.", language) +
      gatherTurn(callId, language, baseUrl),
    ));
  }

  return res.send(twiml('<Pause length="1"/>' + redirectToRespond(callId, baseUrl, (attempt || 0) + 1)));
}

async function handleEscalation(callId: string, businessId: string, callerNumber: string, summary: string) {
  const [biz] = await db
    .select({ subscriptionTier: businesses.subscriptionTier, createdAt: businesses.createdAt })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const plan = biz?.createdAt ? buildPlanFromBusinessRow({ subscriptionTier: biz.subscriptionTier ?? null, createdAt: biz.createdAt }) : null;

  const [existing] = await db.select({ id: escalations.id }).from(escalations).where(eq(escalations.callId, callId)).limit(1);
  if (!existing) {
    await db.insert(escalations).values({ businessId, callId, reason: 'Agent escalation', summary: summary.slice(0, 600) });
  }
  const [settings] = await db.select({ whatsappNumber: businessSettings.whatsappNumber, whatsappVerified: businessSettings.whatsappVerified })
    .from(businessSettings).where(eq(businessSettings.businessId, businessId)).limit(1);
  if ((plan?.features.whatsappNotifications ?? true) && settings?.whatsappVerified && settings.whatsappNumber) {
    await sendEscalationAlert(settings.whatsappNumber, callerNumber, summary).catch(() => null);
  }
  await notifyBusinessOwners(businessId, 'Call Escalated', `Caller ${callerNumber} needs your attention. ${summary}`);
}

export async function handleTwilioVoiceEnd(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const fromNumber = (req.body.From as string) || '';
  const toNumber = (req.body.To as string) || '';
  const callSid = (req.body.CallSid as string | undefined) || '';
  const callDuration = parseInt(req.body.CallDuration ?? '0', 10);
  const callId = typeof req.query.callId === 'string' && req.query.callId ? req.query.callId : null;

  try {
    const idToUpdate = callId ?? await findLatestActiveCallIdByNumber(toNumber, fromNumber);
    if (idToUpdate) {
      await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', duration: callDuration, endedAt: new Date() })
        .where(and(eq(calls.id, idToUpdate), eq(calls.status, 'ACTIVE')));
    }
    logger.info({ fromNumber, toNumber, callDuration, callSid: callSid || null }, 'Twilio call ended');

    if (idToUpdate && callSid) {
      const client = getTwilioClient();
      if (client) {
        const [row] = await db.select({ businessId: calls.businessId }).from(calls).where(eq(calls.id, idToUpdate)).limit(1);
        if (row?.businessId) {
          const [biz] = await db.select({ subscriptionTier: businesses.subscriptionTier, createdAt: businesses.createdAt })
            .from(businesses).where(eq(businesses.id, row.businessId)).limit(1);
          const plan = biz?.createdAt ? buildPlanFromBusinessRow({ subscriptionTier: biz.subscriptionTier ?? null, createdAt: biz.createdAt }) : null;
          if (plan?.features.callRecording ?? true) {
            const recordings = await client.recordings.list({ callSid, limit: 1 }).catch(() => []);
            const recordingSid = recordings?.[0]?.sid;
            const mediaUrl = recordingSid ? twilioRecordingMediaUrl(recordingSid) : null;
            if (mediaUrl) {
              await db.update(calls).set({ recordingUrl: mediaUrl }).where(and(eq(calls.id, idToUpdate), sql`${calls.recordingUrl} is null`));
              logger.info({ callId: idToUpdate, recordingSid }, 'Twilio call recording saved');
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error handling Twilio call end');
  }

  return res.send(twiml('<Hangup/>'));
}

export async function handleTwilioVoiceRecording(req: Request, res: Response) {
  res.sendStatus(200);

  const callId = typeof req.query.callId === 'string' ? req.query.callId : '';
  if (!callId) return;

  const recordingStatus = (req.body.RecordingStatus as string | undefined) ?? '';
  if (recordingStatus && recordingStatus !== 'completed') return;

  const recordingUrl = (req.body.RecordingUrl as string | undefined) ?? '';
  const recordingSid = (req.body.RecordingSid as string | undefined) ?? '';
  const mediaUrl = normalizeTwilioRecordingUrl(recordingUrl || recordingSid);
  if (!mediaUrl) return;

  try {
    const [row] = await db.select({ businessId: calls.businessId }).from(calls).where(eq(calls.id, callId)).limit(1);
    if (row?.businessId) {
      const [biz] = await db.select({ subscriptionTier: businesses.subscriptionTier, createdAt: businesses.createdAt })
        .from(businesses).where(eq(businesses.id, row.businessId)).limit(1);
      const plan = biz?.createdAt ? buildPlanFromBusinessRow({ subscriptionTier: biz.subscriptionTier ?? null, createdAt: biz.createdAt }) : null;
      if (plan && !plan.features.callRecording) return;
    }

    const bytes = await fetchTwilioRecordingBytes(mediaUrl);
    if (!bytes) return;

    const cloudUrl = await uploadMp3ToCloudinary(callId, bytes);
    const finalUrl = cloudUrl ?? mediaUrl;

    await db.update(calls).set({ recordingUrl: finalUrl }).where(eq(calls.id, callId));
    logger.info({ callId, stored: cloudUrl ? 'cloudinary' : 'twilio' }, 'Call recording stored');
  } catch (err) {
    logger.error({ err, callId }, 'Failed to store call recording');
  }
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
