import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls, knowledgeBases, knowledgeDocuments, transcripts } from '../db';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { voiceChat, type ChatMessage } from '../services/document-extract';

const LANG = 'en-NG';

function isWithinHours(operatingHours: Record<string, string>): boolean {
  if (!operatingHours || Object.keys(operatingHours).length === 0) return true;
  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = days[now.getDay()];
  const hours = operatingHours[day];
  if (!hours || hours.toLowerCase() === 'closed') return false;
  const [open, close] = hours.split('-').map(t => t.trim());
  if (!open || !close) return true;
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m ?? 0); };
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= toMins(open) && current <= toMins(close);
}

function inputNcco(callDbId: string) {
  return {
    action: 'input',
    type: ['speech'],
    speechSettings: { endOnSilence: 1.5, language: 'en-NG', maxDuration: 15 },
    eventUrl: [`${env.API_URL}/webhooks/infobip/voice/input?callDbId=${callDbId}`],
  };
}

// POST /webhooks/infobip/voice — Infobip inbound call
export async function handleInfobipVoiceWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'application/json');

  const { from, to, callId } = req.body as Record<string, string>;
  logger.info({ from, to, callId }, 'Inbound Infobip call');

  try {
    let phoneRow = (await db
      .select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, to))
      .limit(1))[0];

    if (!phoneRow && to) {
      const alt = to.startsWith('+') ? to.slice(1) : `+${to}`;
      phoneRow = (await db
        .select({ businessId: phoneNumbers.businessId })
        .from(phoneNumbers)
        .where(eq(phoneNumbers.number, alt))
        .limit(1))[0];
    }

    if (!phoneRow) {
      logger.warn({ to, from }, 'Infobip call to unregistered number');
      return res.json([
        { action: 'talk', text: 'This number is not configured. Goodbye.', language: LANG },
        { action: 'hangup' },
      ]);
    }

    const { businessId } = phoneRow;
    const [[agentRow], [bizRow], [kbRow]] = await Promise.all([
      db.select().from(agentConfigs).where(eq(agentConfigs.businessId, businessId)).limit(1),
      db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
      db.select({ operatingHours: knowledgeBases.operatingHours }).from(knowledgeBases).where(eq(knowledgeBases.businessId, businessId)).limit(1),
    ]);

    const greeting = agentRow?.greeting
      ?? `Hello, thank you for calling ${bizRow?.name ?? 'us'}. How can I help you today?`;
    const businessHoursOnly = agentRow?.businessHoursOnly ?? false;
    const afterHoursMessage = agentRow?.afterHoursMessage ?? 'We are currently closed. Please call back during business hours. Goodbye.';
    const operatingHours = (kbRow?.operatingHours ?? {}) as Record<string, string>;

    if (businessHoursOnly && !isWithinHours(operatingHours)) {
      logger.info({ businessId, from }, 'Call rejected — outside business hours');
      const [abandoned] = await db.insert(calls).values({ businessId, callerNumber: from ?? '', status: 'COMPLETED', resolution: 'ABANDONED' }).returning();
      logger.info({ callDbId: abandoned.id }, 'Abandoned call logged');
      return res.json([
        { action: 'talk', text: afterHoursMessage, language: LANG },
        { action: 'hangup' },
      ]);
    }

    const [callRow] = await db.insert(calls).values({
      businessId,
      callerNumber: from ?? '',
      status: 'ACTIVE',
    }).returning();

    logger.info({ businessId, from, to, callId, callDbId: callRow.id }, 'Infobip call answered');

    return res.json([
      { action: 'talk', text: greeting, language: LANG, bargeIn: true },
      inputNcco(callRow.id),
    ]);
  } catch (err) {
    logger.error({ err, from, to }, 'Error handling Infobip voice webhook');
    return res.json([
      { action: 'talk', text: 'Sorry, we are experiencing technical difficulties. Please try again later.', language: LANG },
      { action: 'hangup' },
    ]);
  }
}

// POST /webhooks/infobip/voice/input — each speech turn in the conversation
export async function handleInfobipVoiceInput(req: Request, res: Response) {
  res.set('Content-Type', 'application/json');
  const callDbId = req.query.callDbId as string;

  const body = req.body as Record<string, unknown>;
  const speechResults = (body.speech as { results?: Array<{ text: string; confidence: number }> } | undefined)?.results;
  const callerText = speechResults?.[0]?.text?.trim() ?? '';

  logger.info({ callDbId, callerText, body }, 'Infobip voice input');

  const retryNcco = [
    { action: 'talk', text: "Sorry, I didn't catch that. Could you say that again?", language: LANG, bargeIn: true },
    inputNcco(callDbId),
  ];

  try {
    if (!callerText) {
      return res.json(retryNcco);
    }

    const [callRow] = await db.select().from(calls).where(eq(calls.id, callDbId)).limit(1);
    if (!callRow) {
      logger.warn({ callDbId }, 'Voice input: call not found');
      return res.json([{ action: 'hangup' }]);
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
      faqs: (kbRow?.faqs as { question: string; answer: string }[]) ?? [],
      websiteSummary: kbRow?.websiteSummary,
      docSummaries: kbDocs.map(d => d.summary ?? '').filter(Boolean),
      agentTone: agentRow?.tone,
      escalationNumber: kbRow?.escalationNumber,
    });

    logger.info({ callDbId, action, reply: reply.slice(0, 120) }, 'AI voice reply');

    await db.insert(transcripts).values({ callId: callDbId, speaker: 'agent', text: reply });

    if (action === 'escalate' && kbRow?.escalationNumber) {
      const escalateTo = kbRow.escalationNumber.replace(/^\+/, '');
      await db.update(calls).set({ status: 'COMPLETED', resolution: 'HUMAN', endedAt: new Date() }).where(eq(calls.id, callDbId));
      return res.json([
        { action: 'talk', text: reply, language: LANG },
        { action: 'connect', endpoint: [{ type: 'phone', number: escalateTo }] },
      ]);
    }

    if (action === 'end' || (action === 'escalate' && !kbRow?.escalationNumber)) {
      await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() }).where(eq(calls.id, callDbId));
      return res.json([
        { action: 'talk', text: reply, language: LANG },
        { action: 'hangup' },
      ]);
    }

    return res.json([
      { action: 'talk', text: reply, language: LANG, bargeIn: true },
      inputNcco(callDbId),
    ]);
  } catch (err) {
    logger.error({ err, callDbId }, 'Error in voice input handler');
    return res.json([
      { action: 'talk', text: "I'm sorry, I encountered an error. Please try again.", language: LANG },
      { action: 'hangup' },
    ]);
  }
}

// POST /webhooks/infobip/voice/record — optional full-call recording callback (kept for compatibility)
export async function handleInfobipRecordingWebhook(req: Request, res: Response) {
  res.status(200).send('OK');
  const { from, recordingUrl, duration } = req.body as Record<string, string>;
  const callDbId = req.query.callDbId as string | undefined;

  try {
    const updateData = {
      recordingUrl: recordingUrl ?? null,
      duration: parseInt(duration ?? '0', 10) || null,
      endedAt: new Date(),
    };

    if (callDbId) {
      await db.update(calls).set(updateData).where(eq(calls.id, callDbId));
    } else if (from) {
      await db.update(calls).set(updateData).where(eq(calls.callerNumber, from));
    }

    logger.info({ from, recordingUrl, duration, callDbId }, 'Infobip call recording saved');
  } catch (err) {
    logger.error({ err }, 'Error saving Infobip call recording');
  }
}
