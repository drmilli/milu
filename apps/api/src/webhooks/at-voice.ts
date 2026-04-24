import type { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls, knowledgeBases } from '../db';
import { logger } from '../config/logger';
import { env } from '../config/env';

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

    const [[agentRow], [bizRow], [kbRow]] = await Promise.all([
      db.select().from(agentConfigs).where(eq(agentConfigs.businessId, businessId)).limit(1),
      db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
      db.select({ operatingHours: knowledgeBases.operatingHours }).from(knowledgeBases).where(eq(knowledgeBases.businessId, businessId)).limit(1),
    ]);

    const greeting = agentRow?.greeting
      ?? `Hello, thank you for calling ${bizRow?.name ?? 'us'}. How can I help you today?`;
    const enableRecording = agentRow?.enableRecording ?? true;
    const maxDuration = agentRow?.maxCallDuration ?? 600;
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
        return res.send(xml(`<Say>${afterHoursMessage}</Say><Hangup/>`));
      }

      const [start, end] = todayHours.split('-');
      if (start && end) {
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        const startTime = startH * 60 + startM;
        const endTime = endH * 60 + endM;

        if (currentTime < startTime || currentTime > endTime) {
          return res.send(xml(`<Say>${afterHoursMessage}</Say><Hangup/>`));
        }
      }
    }

    if (!enableRecording) {
      return res.send(xml(`<Say>${greeting}</Say><Hangup/>`));
    }

    const apiUrl = env.API_URL.replace(/\/$/, '');
    const callbackUrl = `${apiUrl}/webhooks/at/voice/record?callId=${encodeURIComponent(callRow?.id ?? '')}`;
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
  const callId = typeof req.query.callId === 'string' && req.query.callId ? req.query.callId : null;

  try {
    const duration = parseInt(durationInSeconds ?? '0', 10);

    if (callId) {
      await db.update(calls)
        .set({
          status: 'COMPLETED',
          resolution: 'AI',
          duration,
          recordingUrl: recordingUrl ?? null,
          endedAt: new Date(),
        })
        .where(eq(calls.id, callId));
    } else {
      const destinationNumber = (req.body as any)?.destinationNumber as string | undefined;
      const businessId = await resolveBusinessIdByNumber(destinationNumber);
      const latestCallId = businessId ? await findLatestActiveCallId(businessId, callerNumber) : null;
      if (latestCallId) {
        await db.update(calls)
          .set({
            status: 'COMPLETED',
            resolution: 'AI',
            duration,
            recordingUrl: recordingUrl ?? null,
            endedAt: new Date(),
          })
          .where(eq(calls.id, latestCallId));
      }
    }

    logger.info({ sessionId, callerNumber, durationInSeconds, recordingUrl }, 'AT call recording saved');
  } catch (err) {
    logger.error({ err }, 'Error saving AT call recording');
  }
}

async function handleAtCallEnd(body: Record<string, string>) {
  const { callerNumber, durationInSeconds, destinationNumber } = body;
  try {
    const businessId = await resolveBusinessIdByNumber(destinationNumber);
    const latestCallId = businessId ? await findLatestActiveCallId(businessId, callerNumber) : null;
    if (latestCallId) {
      await db.update(calls)
        .set({ status: 'COMPLETED', duration: parseInt(durationInSeconds ?? '0', 10), endedAt: new Date() })
        .where(eq(calls.id, latestCallId));
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
