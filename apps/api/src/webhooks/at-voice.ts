import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls } from '../db';
import { logger } from '../config/logger';

function xml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

// POST /webhooks/at/voice — Africa's Talking inbound call handler
export async function handleAtVoiceWebhook(req: Request, res: Response) {
  res.set('Content-Type', 'text/xml');

  const { sessionId, callerNumber, destinationNumber, isActive } = req.body as Record<string, string>;

  logger.info({ sessionId, callerNumber, destinationNumber, isActive }, 'Inbound AT voice call');

  // AT sends isActive=0 on call end
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
      return res.send(xml('<Say>This number is not configured. Goodbye.</Say><Hangup/>'));
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
    const businessHoursOnly = agentRow?.businessHoursOnly ?? false;
    const afterHoursMessage = agentRow?.afterHoursMessage
      ?? 'We are currently closed. Please call back during business hours. Goodbye.';

    // Log call to DB
    await db.insert(calls).values({
      businessId,
      callerNumber: callerNumber ?? '',
      status: 'ACTIVE',
    });

    logger.info({ businessId, callerNumber, destinationNumber, sessionId }, 'AT call answered');

    if (businessHoursOnly) {
      // TODO: check actual business hours from knowledge_base
      // For now always within hours
    }

    if (!enableRecording) {
      return res.send(xml(`<Say>${greeting}</Say><Hangup/>`));
    }

    // Say greeting then record the call
    const callbackUrl = `https://api.miluai.app/webhooks/at/voice/record`;
    return res.send(xml(
      `<Say>${greeting}</Say>` +
      `<Record finishOnKey="#" maxLength="${maxDuration}" trimSilence="true" playBeep="false" callbackUrl="${callbackUrl}"/>`
    ));

  } catch (err) {
    logger.error({ err, callerNumber, destinationNumber }, 'Error handling AT voice webhook');
    return res.send(xml('<Say>Sorry, we are experiencing technical difficulties. Please try again later.</Say><Hangup/>'));
  }
}

// POST /webhooks/at/voice/record — called by AT when recording is done
export async function handleAtRecordingWebhook(req: Request, res: Response) {
  res.status(200).send('OK');

  const { sessionId, callerNumber, durationInSeconds, recordingUrl } = req.body as Record<string, string>;

  try {
    await db.update(calls)
      .set({
        status: 'COMPLETED',
        resolution: 'AI',
        duration: parseInt(durationInSeconds ?? '0', 10),
        recordingUrl: recordingUrl ?? null,
        endedAt: new Date(),
      })
      .where(eq(calls.callerNumber, callerNumber));

    logger.info({ sessionId, callerNumber, durationInSeconds, recordingUrl }, 'AT call recording saved');
  } catch (err) {
    logger.error({ err }, 'Error saving AT call recording');
  }
}

async function handleAtCallEnd(body: Record<string, string>) {
  const { callerNumber, durationInSeconds } = body;
  try {
    await db.update(calls)
      .set({ status: 'COMPLETED', duration: parseInt(durationInSeconds ?? '0', 10), endedAt: new Date() })
      .where(eq(calls.callerNumber, callerNumber));
    logger.info({ callerNumber, durationInSeconds }, 'AT call ended');
  } catch (err) {
    logger.error({ err }, 'Error updating AT call on end');
  }
}
