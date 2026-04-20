import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls } from '../db';
import { logger } from '../config/logger';

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
    const [[agentRow], [bizRow]] = await Promise.all([
      db.select().from(agentConfigs).where(eq(agentConfigs.businessId, businessId)).limit(1),
      db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    ]);

    const greeting = agentRow?.greeting
      ?? `Hello, thank you for calling ${bizRow?.name ?? 'us'}. How can I help you today?`;
    const enableRecording = agentRow?.enableRecording ?? true;
    const maxDuration = agentRow?.maxCallDuration ?? 600;
    const language = agentRow?.language === 'yo' ? 'en-NG' : 'en-NG';

    await db.insert(calls).values({
      businessId,
      callerNumber: from ?? '',
      status: 'ACTIVE',
    });

    logger.info({ businessId, from, to, callId }, 'Infobip call answered');

    // Infobip uses NCCO (Node Call Control Objects) — array of actions
    const ncco: unknown[] = [
      { action: 'talk', text: greeting, language, bargeIn: false },
    ];

    if (enableRecording) {
      ncco.push({
        action: 'record',
        eventUrl: [`${process.env.API_URL}/webhooks/infobip/voice/record`],
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
  try {
    await db.update(calls)
      .set({
        status: 'COMPLETED',
        resolution: 'AI',
        duration: parseInt(duration ?? '0', 10),
        recordingUrl: recordingUrl ?? null,
        endedAt: new Date(),
      })
      .where(eq(calls.callerNumber, from));
    logger.info({ from, recordingUrl, duration }, 'Infobip call recording saved');
  } catch (err) {
    logger.error({ err }, 'Error saving Infobip call recording');
  }
}
