import type { Request, Response } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, phoneNumbers, agentConfigs, businesses, calls, notifications } from '../db';
import { logger } from '../config/logger';

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
  const callSid = (req.body.CallSid as string) || '';

  logger.info({ toNumber, fromNumber, callSid, body: req.body }, 'Inbound Twilio call received');

  try {
    // Twilio sends To in E.164 (+17177440613); try both with and without + to match DB
    const [phoneRow] = await db
      .select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, toNumber))
      .limit(1)
      .then(async (rows) => {
        if (rows.length) return rows;
        // Try without leading +
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
    // Map internal language codes to Twilio-compatible BCP-47 codes for Alice voice
    const langMap: Record<string, string> = { en: 'en-US', yo: 'en-US', ig: 'en-US', ha: 'en-US', pcm: 'en-US' };
    const language = langMap[agentRow?.language ?? 'en'] ?? 'en-US';

    const [callRow] = await db.insert(calls).values({
      businessId,
      callerNumber: fromNumber,
      status: 'ACTIVE',
    }).returning({ id: calls.id });

    logger.info({ businessId, fromNumber, toNumber, callSid }, 'Inbound Twilio call answered');

    if (businessHoursOnly && !isWithinBusinessHours()) {
      return res.send(twiml(`<Say voice="alice" language="${language}">${afterHoursMessage}</Say><Hangup/>`));
    }

    // Build TwiML response
    let xml = `<Say voice="alice" language="${language}">${greeting}</Say>`;

    if (enableRecording) {
      const callId = encodeURIComponent(callRow?.id ?? '');
      xml += `<Record maxLength="${maxDuration}" transcribe="true" transcribeCallback="/webhooks/twilio/transcription?callId=${callId}" action="/webhooks/twilio/voice/end?callId=${callId}" playBeep="false"/>`;
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
  const callId = typeof req.query.callId === 'string' && req.query.callId ? req.query.callId : null;

  try {
    const [phoneRow] = await db
      .select({ businessId: phoneNumbers.businessId })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.number, toNumber))
      .limit(1);

    if (phoneRow) {
      const idToUpdate = callId ?? await findLatestActiveCallId(phoneRow.businessId, fromNumber);
      if (idToUpdate) {
        await db
          .update(calls)
          .set({
            status: 'COMPLETED',
            resolution: 'AI',
            duration: callDuration,
            recordingUrl: recordingUrl ?? null,
            endedAt: new Date(),
          })
          .where(eq(calls.id, idToUpdate));
      }
    }

    logger.info({ fromNumber, toNumber, callDuration, recordingUrl }, 'Twilio call ended');
  } catch (err) {
    logger.error({ err }, 'Error handling Twilio call end');
  }

  return res.send(twiml('<Hangup/>'));
}

export async function handleTwilioVoiceStatus(req: Request, res: Response) {
  res.sendStatus(200);
  const body = req.body as Record<string, unknown>;
  const callSid = (body.CallSid as string | undefined) ?? '';
  const callStatus = (body.CallStatus as string | undefined) ?? '';
  const to = (body.To as string | undefined) ?? '';
  const from = (body.From as string | undefined) ?? '';
  const direction = (body.Direction as string | undefined) ?? '';
  const duration = body.CallDuration as string | number | undefined;

  logger.info({
    callSid,
    callStatus,
    to: to ? maskPhone(to) : undefined,
    from: from ? maskPhone(from) : undefined,
    direction,
    duration: duration ?? null,
  }, 'Twilio voice status');
}

function maskPhone(value: string) {
  const cleaned = value.replace(/^whatsapp:/, '');
  const last4 = cleaned.slice(-4);
  const prefix = cleaned.slice(0, Math.max(0, cleaned.length - 4));
  const maskedPrefix = prefix.replace(/\d/g, '*');
  return `${maskedPrefix}${last4}`;
}

async function findLatestActiveCallId(businessId: string, callerNumber: string): Promise<string | null> {
  const [row] = await db.select({ id: calls.id }).from(calls)
    .where(and(
      eq(calls.businessId, businessId),
      eq(calls.callerNumber, callerNumber),
      eq(calls.status, 'ACTIVE'),
    ))
    .orderBy(desc(calls.startedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function handleTwilioMessageStatus(req: Request, res: Response) {
  res.sendStatus(200);

  const body = req.body as Record<string, unknown>;
  const messageSid = (body.MessageSid as string | undefined) ?? (body.SmsSid as string | undefined) ?? '';
  const messageStatus = (body.MessageStatus as string | undefined) ?? (body.SmsStatus as string | undefined) ?? '';
  const to = (body.To as string | undefined) ?? '';
  const from = (body.From as string | undefined) ?? '';
  const errorCode = body.ErrorCode as string | number | undefined;
  const errorMessage = body.ErrorMessage as string | undefined;

  logger.info({
    sid: messageSid,
    status: messageStatus,
    to: to ? maskPhone(to) : undefined,
    from: from ? maskPhone(from) : undefined,
    errorCode: errorCode ?? null,
    errorMessage: errorMessage ?? null,
  }, 'Twilio message status');

  if (!messageSid) return;
  const normalized = messageStatus.toLowerCase();
  const status = (normalized === 'delivered' || normalized === 'sent' || normalized === 'read')
    ? 'SENT'
    : (normalized === 'failed' || normalized === 'undelivered')
      ? 'FAILED'
      : null;

  try {
    const meta = {
      twilioStatus: messageStatus,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      to,
      from,
    };
    await db.update(notifications)
      .set({
        ...(status ? { status } : {}),
        data: sql`${notifications.data} || ${JSON.stringify(meta)}::jsonb`,
      } as any)
      .where(sql`${notifications.data}->>'twilioSid' = ${messageSid}`);
  } catch (err) {
    logger.error({ err, messageSid, status }, 'Failed to update WhatsApp notification status');
  }
}

export async function handleTwilioIncomingMessage(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>;
  const messageSid = (body.MessageSid as string | undefined) ?? (body.SmsSid as string | undefined) ?? '';
  const messageStatus = (body.MessageStatus as string | undefined) ?? (body.SmsStatus as string | undefined) ?? '';
  const to = (body.To as string | undefined) ?? '';
  const from = (body.From as string | undefined) ?? '';
  const text = (body.Body as string | undefined) ?? '';
  const numMedia = body.NumMedia as string | number | undefined;

  logger.info({
    sid: messageSid,
    status: messageStatus || 'inbound',
    to: to ? maskPhone(to) : undefined,
    from: from ? maskPhone(from) : undefined,
    textPreview: text ? `${text.slice(0, 140)}${text.length > 140 ? '…' : ''}` : '',
    numMedia: numMedia ?? null,
  }, 'Twilio incoming message');

  try {
    await db.insert(notifications).values({
      channel: 'WHATSAPP',
      status: 'SENT',
      title: 'Incoming WhatsApp',
      body: text,
      recipient: from,
      data: {
        direction: 'inbound',
        twilioSid: messageSid,
        status: messageStatus || 'inbound',
        from,
        to,
        numMedia: numMedia ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, messageSid }, 'Failed to persist incoming WhatsApp message');
  }

  return res.sendStatus(200);
}

export async function handleTwilioIncomingMessageFallback(req: Request, res: Response) {
  const body = req.body as Record<string, unknown>;
  const messageSid = (body.MessageSid as string | undefined) ?? (body.SmsSid as string | undefined) ?? '';
  const to = (body.To as string | undefined) ?? '';
  const from = (body.From as string | undefined) ?? '';
  const errorCode = body.ErrorCode as string | number | undefined;
  const errorMessage = body.ErrorMessage as string | undefined;

  logger.warn({
    sid: messageSid,
    to: to ? maskPhone(to) : undefined,
    from: from ? maskPhone(from) : undefined,
    errorCode: errorCode ?? null,
    errorMessage: errorMessage ?? null,
    body,
  }, 'Twilio incoming message fallback');

  return res.sendStatus(200);
}
