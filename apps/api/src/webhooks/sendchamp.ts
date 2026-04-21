import type { Request, Response } from 'express';
import { logger } from '../config/logger';
import { db, businesses, knowledgeBases, agentConfigs, calls, phoneNumbers } from '../db';
import { eq } from 'drizzle-orm';

/**
 * Sendchamp sends all events to a single webhook URL configured in
 * Dashboard → API & Webhooks. The `service` field tells us the event type.
 *
 * Webhook URL to set in Sendchamp: https://api.miluai.app/webhooks/sendchamp
 */
export async function handleSendchampWebhook(req: Request, res: Response) {
  // Ack immediately — Sendchamp expects a fast 200
  res.sendStatus(200);

  const payload = req.body as Record<string, unknown>;
  const service = (payload.service as string | undefined)?.toLowerCase();

  logger.info({ service, payload }, 'Sendchamp webhook received');

  try {
    if (service === 'whatsapp') {
      await handleWhatsAppEvent(payload);
    } else if (service === 'sms') {
      await handleSmsEvent(payload);
    } else if (service === 'voice') {
      await handleVoiceEvent(payload);
    } else if (service === 'verification') {
      logger.info({ payload }, 'Sendchamp OTP event');
    } else {
      logger.info({ service, payload }, 'Sendchamp unhandled event type');
    }
  } catch (err) {
    logger.error({ err, service }, 'Sendchamp webhook processing error');
  }
}

async function handleWhatsAppEvent(payload: Record<string, unknown>) {
  const type = (payload.type as string | undefined)?.toLowerCase();
  const status = (payload.status as string | undefined)?.toLowerCase();

  // Delivery status update
  if (status && type !== 'inbound') {
    logger.info({ to: payload.phone_number ?? payload.recipient, status, id: payload.id ?? payload.uid }, 'Sendchamp WhatsApp delivery update');
    return;
  }

  // Inbound message from customer
  const from = (payload.from ?? payload.sender ?? payload.phone_number) as string | undefined;
  const text = (payload.message ?? payload.text ?? (payload.content as Record<string, unknown>)?.text) as string | undefined;

  if (!from || !text) {
    logger.warn({ payload }, 'Sendchamp WhatsApp inbound missing from/text');
    return;
  }

  logger.info({ from, text }, 'Sendchamp WhatsApp inbound message');

  // Look up which business this WhatsApp number belongs to
  const normalised = from.replace(/^\+/, '');
  const [business] = await db.select({ id: businesses.id, name: businesses.name })
    .from(businesses)
    .innerJoin(knowledgeBases, eq(knowledgeBases.businessId, businesses.id))
    .limit(1); // TODO: match by business WhatsApp number if stored

  if (!business) {
    logger.warn({ from }, 'Sendchamp WhatsApp: no matching business found');
    return;
  }

  // Load agent config for a response
  const [agent] = await db.select().from(agentConfigs)
    .where(eq(agentConfigs.businessId, business.id)).limit(1);

  const greeting = agent?.greeting ?? `Hi! You've reached ${business.name}. We'll get back to you shortly.`;
  logger.info({ businessId: business.id, from, reply: greeting }, 'Sendchamp WhatsApp auto-reply queued');
  // Auto-reply can be sent here by importing sendchampWhatsApp if desired
}

async function handleSmsEvent(payload: Record<string, unknown>) {
  const status = (payload.status as string | undefined)?.toLowerCase();
  logger.info({ to: payload.phone_number, status, ref: payload.reference }, 'Sendchamp SMS delivery update');
}

async function handleVoiceEvent(payload: Record<string, unknown>) {
  const status = (payload.status as string | undefined)?.toLowerCase();
  const callId = (payload.call_id ?? payload.session_id ?? payload.uid) as string | undefined;

  logger.info({ callId, status, payload }, 'Sendchamp voice event');

  if (!callId) return;

  // Update call record if we have a matching entry
  if (status === 'completed' || status === 'ended') {
    const duration = (payload.duration ?? payload.call_duration) as number | undefined;
    await db.update(calls)
      .set({
        status: 'completed',
        duration: duration ?? null,
        endedAt: new Date(),
      })
      .where(eq(calls.providerCallId, callId));
  }
}
