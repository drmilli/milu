import type { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, businessSettings, calls, escalations, knowledgeBases, knowledgeDocuments, transcripts } from '../db';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { voiceChat, type ChatMessage } from '../services/document-extract';
import { transcribeRecordingSnippet } from '../services/transcription';
import { notifyBusinessOwners } from '../services/notifications';
import { sendEscalationAlert } from '../services/whatsapp';

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

function recordTurn(callId: string, seconds: number, baseUrl: string) {
  const callbackUrl = `${baseUrl.replace(/\/$/, '')}/webhooks/at/voice?callId=${encodeURIComponent(callId)}`;
  const maxLength = Math.max(3, Math.min(30, seconds));
  return `<Record maxLength="${maxLength}" finishOnKey="#" trimSilence="true" playBeep="true" callbackUrl="${callbackUrl}"></Record>`;
}

async function handleAtVoiceTurn(
  callDbId: string,
  callerNumber: string | undefined,
  recordingUrl: string | undefined,
  baseUrl: string,
) {
  const retry = xml(
    `<Say>${escapeXml("Sorry, I didn't catch that. Please speak after the beep, then press hash when done.")}</Say>` +
    recordTurn(callDbId, 6, baseUrl),
  );

  if (!recordingUrl) return retry;

  const callerText = await transcribeRecordingSnippet(recordingUrl);
  logger.info({ callDbId, callerText: callerText.slice(0, 200) }, 'AT voice input');

  if (!callerText) return retry;

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
    faqs: (kbRow?.faqs as { question: string; answer: string }[]) ?? [],
    websiteSummary: kbRow?.websiteSummary,
    docSummaries: kbDocs.map(d => d.summary ?? '').filter(Boolean),
    agentTone: agentRow?.tone,
    escalationNumber: kbRow?.escalationNumber,
  });

  await db.insert(transcripts).values({ callId: callDbId, speaker: 'agent', text: reply });

  if (action === 'escalate') {
    const reason = 'Agent escalation';
    const summary = callerText.slice(0, 600);

    const [existingEsc] = await db.select({ id: escalations.id }).from(escalations)
      .where(eq(escalations.callId, callDbId))
      .limit(1);
    if (!existingEsc) {
      await db.insert(escalations).values({
        businessId: callRow.businessId,
        callId: callDbId,
        reason,
        summary,
      });
    }

    const [settings] = await db.select({ whatsappNumber: businessSettings.whatsappNumber, whatsappVerified: businessSettings.whatsappVerified })
      .from(businessSettings).where(eq(businessSettings.businessId, callRow.businessId)).limit(1);
    if (settings?.whatsappVerified && settings.whatsappNumber) {
      await sendEscalationAlert(settings.whatsappNumber, callerNumber ?? callRow.callerNumber ?? '', summary).catch(() => null);
    }

    await notifyBusinessOwners(callRow.businessId, 'Call Escalated', `Caller ${callerNumber ?? callRow.callerNumber ?? ''} needs your attention. ${summary}`);

    await db.update(calls)
      .set({ status: 'COMPLETED', resolution: 'HUMAN', endedAt: new Date() })
      .where(eq(calls.id, callDbId));

    return xml(`<Say>${escapeXml(reply)}</Say><Hangup></Hangup>`);
  }

  if (action === 'end') {
    await db.update(calls)
      .set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() })
      .where(eq(calls.id, callDbId));
    return xml(`<Say>${escapeXml(reply)}</Say><Hangup></Hangup>`);
  }

  return xml(
    `<Say>${escapeXml(reply)}</Say>` +
    recordTurn(callDbId, 6, baseUrl),
  );
}

// POST /webhooks/at/voice — Africa's Talking inbound call handler
export async function handleAtVoiceWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const { sessionId, callerNumber, destinationNumber, isActive, recordingUrl } = req.body as Record<string, string>;

  logger.info({
    sessionId,
    callerNumber,
    destinationNumber,
    isActive,
    bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>),
  }, 'Inbound AT voice call');

  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || 'https';
  const host = req.get('host');
  const baseUrl = host ? `${proto}://${host}` : env.API_URL.replace(/\/$/, '');

  const callDbIdFromQuery = typeof req.query.callId === 'string' && req.query.callId ? req.query.callId : null;

  // Process recording FIRST — AT sometimes sends recordingUrl together with isActive=0
  // (when caller hangs up at the same time the recording ends). We still want to transcribe
  // and reply so the caller hears the AI response if the line is still open.
  if (recordingUrl) {
    logger.info({
      callDbIdFromQuery,
      hasRecordingUrl: true,
      bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>),
    }, 'AT voice turn received');

    try {
      let callDbId = callDbIdFromQuery;
      if (!callDbId) {
        const businessId = await resolveBusinessIdByNumber(destinationNumber);
        callDbId = businessId ? await findLatestActiveCallId(businessId, callerNumber ?? '') : null;
      }

      if (!callDbId) {
        logger.warn({ callerNumber, destinationNumber }, 'AT voice turn: call not found');
        return res.send(xml('<Hangup></Hangup>'));
      }

      const responseXml = await handleAtVoiceTurn(callDbId, callerNumber, recordingUrl, baseUrl);
      // If the call ended while we were processing, AT will ignore further XML but we still
      // want the DB updated — handleAtVoiceTurn handles that for escalate/end actions.
      if (isActive === '0') await handleAtCallEnd(req.body);
      return res.send(responseXml);
    } catch (err) {
      logger.error({ err, callDbIdFromQuery }, 'Error handling AT voice turn');
      if (isActive === '0') await handleAtCallEnd(req.body);
      return res.send(xml(`<Say>${escapeXml('I am sorry, I encountered an error. Please try again.')}</Say><Hangup></Hangup>`));
    }
  }

  // No recordingUrl — pure call-end or call-start notification
  if (isActive === '0') {
    await handleAtCallEnd(req.body);
    return res.send(xml(''));
  }

  try {
    // Normalize number: AT sends in format like +2341234567890
    const normalizedDest = destinationNumber?.trim();

    // Find business by destination number (try with and without +)
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

    const greeting = agentRow?.greeting
      ?? `Hello, thank you for calling ${bizRow?.name ?? 'us'}. How can I help you today?`;
    const enableRecording = agentRow?.enableRecording ?? true;
    const maxDuration = agentRow?.maxCallDuration ?? 600;
    const turnSeconds = Math.min(6, maxDuration);
    const businessHoursOnly = agentRow?.businessHoursOnly ?? false;
    const afterHoursMessage = agentRow?.afterHoursMessage
      ?? 'We are currently closed. Please call back during business hours. Goodbye.';

    const [callRow] = await db.insert(calls).values({
      businessId,
      callerNumber: callerNumber ?? '',
      status: 'ACTIVE',
    }).returning({ id: calls.id });

    logger.info({ businessId, callerNumber, destinationNumber, sessionId }, 'AT call answered');

    if (businessHoursOnly && kbRow?.operatingHours) {
      const now = new Date();
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = days[now.getDay()];
      const hours = kbRow.operatingHours as Record<string, string>; // e.g., { monday: "09:00-17:00" }
      
      const todayHours = hours[currentDay];
      if (!todayHours || todayHours.toLowerCase() === 'closed') {
        return res.send(xml(`<Say>${escapeXml(afterHoursMessage)}</Say><Hangup></Hangup>`));
      }

      const [start, end] = todayHours.split('-');
      if (start && end) {
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        const startTime = startH * 60 + startM;
        const endTime = endH * 60 + endM;

        if (currentTime < startTime || currentTime > endTime) {
          return res.send(xml(`<Say>${escapeXml(afterHoursMessage)}</Say><Hangup></Hangup>`));
        }
      }
    }

    if (!enableRecording) {
      return res.send(xml(`<Say>${escapeXml(greeting)}</Say><Hangup></Hangup>`));
    }

    const callDbId = callRow?.id ?? '';
    const responseXml = xml(
      `<Say>${escapeXml(greeting)}</Say>` +
      recordTurn(callDbId, turnSeconds, baseUrl)
    );
    logger.info({ callDbId, xml: responseXml.slice(0, 400) }, 'AT voice response');
    return res.send(responseXml);

  } catch (err) {
    logger.error({ err, callerNumber, destinationNumber }, 'Error handling AT voice webhook');
    return res.send(xml(`<Say>${escapeXml('Sorry, we are experiencing technical difficulties. Please try again later.')}</Say><Hangup></Hangup>`));
  }
}

// POST /webhooks/at/voice/record — called by AT when a recording turn is done
export async function handleAtRecordingWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const { callerNumber, recordingUrl } = req.body as Record<string, string>;
  const callDbId = typeof req.query.callId === 'string' && req.query.callId ? req.query.callId : null;

  if (!callDbId) {
    return res.send(xml('<Hangup></Hangup>'));
  }

  logger.info({
    callDbId,
    hasRecordingUrl: Boolean(recordingUrl),
    bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>),
  }, 'AT recording webhook received');

  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || 'https';
  const host = req.get('host');
  const baseUrl = host ? `${proto}://${host}` : env.API_URL.replace(/\/$/, '');
  try {
    const responseXml = await handleAtVoiceTurn(callDbId, callerNumber, recordingUrl, baseUrl);
    return res.send(responseXml);
  } catch (err) {
    logger.error({ err, callDbId }, 'Error in AT voice input handler');
    return res.send(xml(`<Say>${escapeXml('I am sorry, I encountered an error. Please try again.')}</Say><Hangup/>`));
  }
}

async function handleAtCallEnd(body: Record<string, string>) {
  const { callerNumber, durationInSeconds, destinationNumber } = body;
  try {
    const businessId = await resolveBusinessIdByNumber(destinationNumber);
    const latestCallId = businessId ? await findLatestActiveCallId(businessId, callerNumber) : null;
    if (latestCallId) {
      // Only update if still ACTIVE — if handleAtVoiceTurn already set COMPLETED+resolution, skip
      await db.update(calls)
        .set({ status: 'COMPLETED', resolution: 'ABANDONED', duration: parseInt(durationInSeconds ?? '0', 10), endedAt: new Date() })
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
