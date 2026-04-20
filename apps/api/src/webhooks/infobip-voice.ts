import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls, knowledgeBases } from '../db';
import { logger } from '../config/logger';
import { transcribeCallRecording } from '../services/transcription';

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

// POST /webhooks/infobip/voice — Infobip inbound call (NCCO response)
export async function handleInfobipVoiceWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'application/json');

  const { from, to, callId } = req.body as Record<string, string>;
  logger.info({ from, to, callId, body: req.body }, 'Inbound Infobip call');

  try {
    // Match the called number with/without + prefix
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
        { action: 'talk', text: 'This number is not configured. Goodbye.', language: 'en-NG' },
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
    const enableRecording = agentRow?.enableRecording ?? true;
    const enableTranscription = agentRow?.enableTranscription ?? true;
    const maxDuration = agentRow?.maxCallDuration ?? 600;
    const language = 'en-NG';
    const businessHoursOnly = agentRow?.businessHoursOnly ?? false;
    const afterHoursMessage = agentRow?.afterHoursMessage ?? 'We are currently closed. Please call back during business hours. Goodbye.';
    const operatingHours = (kbRow?.operatingHours ?? {}) as Record<string, string>;

    await db.insert(calls).values({
      businessId,
      callerNumber: from ?? '',
      status: 'ACTIVE',
    });

    // Check business hours
    if (businessHoursOnly && !isWithinHours(operatingHours)) {
      logger.info({ businessId, from }, 'Call rejected — outside business hours');
      await db.insert(calls).values({ businessId, callerNumber: from ?? '', status: 'COMPLETED', resolution: 'ABANDONED' });
      return res.json([
        { action: 'talk', text: afterHoursMessage, language },
        { action: 'hangup' },
      ]);
    }

    const [callRow] = await db.insert(calls).values({
      businessId,
      callerNumber: from ?? '',
      status: 'ACTIVE',
    }).returning();

    logger.info({ businessId, from, to, callId, callDbId: callRow.id }, 'Infobip call answered');

    const ncco: unknown[] = [
      { action: 'talk', text: greeting, language, bargeIn: false },
    ];

    if (enableRecording) {
      ncco.push({
        action: 'record',
        eventUrl: [`${process.env.API_URL}/webhooks/infobip/voice/record?callDbId=${callRow.id}&transcribe=${enableTranscription}`],
        endOnSilence: 10,
        timeout: maxDuration,
        beepStart: false,
      });
    }

    ncco.push({ action: 'hangup' });
    return res.json(ncco);

  } catch (err) {
    logger.error({ err, from, to }, 'Error handling Infobip voice webhook');
    return res.json([
      { action: 'talk', text: 'Sorry, we are experiencing technical difficulties. Please try again later.', language: 'en-NG' },
      { action: 'hangup' },
    ]);
  }
}

// POST /webhooks/infobip/voice/record — recording complete callback
export async function handleInfobipRecordingWebhook(req: Request, res: Response) {
  res.status(200).send('OK');
  const { from, recordingUrl, duration } = req.body as Record<string, string>;
  const callDbId = req.query.callDbId as string | undefined;
  const shouldTranscribe = req.query.transcribe === 'true';

  try {
    const updateData = {
      status: 'COMPLETED' as const,
      resolution: 'AI' as const,
      duration: parseInt(duration ?? '0', 10),
      recordingUrl: recordingUrl ?? null,
      endedAt: new Date(),
    };

    if (callDbId) {
      await db.update(calls).set(updateData).where(eq(calls.id, callDbId));
    } else {
      await db.update(calls).set(updateData).where(eq(calls.callerNumber, from));
    }

    logger.info({ from, recordingUrl, duration, callDbId }, 'Infobip call recording saved');

    // Kick off transcription async — don't await so webhook responds fast
    if (shouldTranscribe && recordingUrl && callDbId) {
      transcribeCallRecording(callDbId, recordingUrl).catch(err =>
        logger.error({ err, callDbId }, 'Background transcription failed')
      );
    }
  } catch (err) {
    logger.error({ err }, 'Error saving Infobip call recording');
  }
}
