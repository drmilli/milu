import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls } from '../db';
import { logger } from '../config/logger';
import { randomUUID } from 'crypto';

function twiml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

function isWithinBusinessHours(): boolean {
  // TODO: wire to per-business operating hours from knowledge_base
  // For now, always within hours
  return true;
}

export async function handleTwilioVoiceWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const toNumber = (req.body.To as string) || '';
  const fromNumber = (req.body.From as string) || '';
  const callSid = (req.body.CallSid as string) || randomUUID();

  try {
    // Find which business owns the called number
    const [phoneRow] = await db
      .select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, toNumber))
      .limit(1);

    if (!phoneRow) {
      logger.warn({ toNumber, fromNumber }, 'Inbound call to unregistered number');
      return res.send(twiml('<Say voice="alice">This number is not configured. Goodbye.</Say><Hangup/>'));
    }

    const { businessId } = phoneRow;

    // Load agent config and business name in parallel
    const [[agentRow], [bizRow]] = await Promise.all([
      db.select().from(agentConfigs).where(eq(agentConfigs.businessId, businessId)).limit(1),
      db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    ]);

    const greeting = agentRow?.greeting ?? `Hello, thank you for calling ${bizRow?.name ?? 'us'}. How can I help you today?`;
    const enableRecording = agentRow?.enableRecording ?? true;
    const maxDuration = agentRow?.maxCallDuration ?? 600;
    const businessHoursOnly = agentRow?.businessHoursOnly ?? false;
    const afterHoursMessage = agentRow?.afterHoursMessage ?? 'We are currently closed. Please call back during business hours. Goodbye.';
    const language = agentRow?.language === 'yo' ? 'en' : (agentRow?.language ?? 'en'); // Twilio Say language codes

    // Log call to DB
    await db.insert(calls).values({
      businessId,
      callerNumber: fromNumber,
      status: 'ACTIVE',
    });

    logger.info({ businessId, fromNumber, toNumber, callSid }, 'Inbound Twilio call answered');

    if (businessHoursOnly && !isWithinBusinessHours()) {
      return res.send(twiml(`<Say voice="alice" language="${language}">${afterHoursMessage}</Say><Hangup/>`));
    }

    // Build TwiML response
    let xml = `<Say voice="alice" language="${language}">${greeting}</Say>`;

    if (enableRecording) {
      // Record the call and transcribe it; Twilio calls /webhooks/twilio/recording when done
      xml += `<Record maxLength="${maxDuration}" transcribe="true" transcribeCallback="/webhooks/twilio/transcription" action="/webhooks/twilio/voice/end" playBeep="false"/>`;
    } else {
      xml += `<Pause length="${maxDuration}"/>`;
    }

    return res.send(twiml(xml));
  } catch (err) {
    logger.error({ err, toNumber, fromNumber }, 'Error handling Twilio voice webhook');
    return res.send(twiml('<Say voice="alice">Sorry, we are experiencing technical difficulties. Please try again later.</Say><Hangup/>'));
  }
}

export async function handleTwilioVoiceEnd(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const fromNumber = (req.body.From as string) || '';
  const toNumber = (req.body.To as string) || '';
  const callDuration = parseInt(req.body.CallDuration ?? '0', 10);
  const recordingUrl = req.body.RecordingUrl as string | undefined;

  try {
    const [phoneRow] = await db
      .select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, toNumber))
      .limit(1);

    if (phoneRow) {
      await db
        .update(calls)
        .set({
          status: 'COMPLETED',
          resolution: 'AI',
          duration: callDuration,
          recordingUrl: recordingUrl ?? null,
          endedAt: new Date(),
        })
        .where(eq(calls.callerNumber, fromNumber));
    }

    logger.info({ fromNumber, toNumber, callDuration, recordingUrl }, 'Twilio call ended');
  } catch (err) {
    logger.error({ err }, 'Error handling Twilio call end');
  }

  return res.send(twiml('<Hangup/>'));
}
