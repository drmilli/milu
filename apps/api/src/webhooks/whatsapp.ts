import type { Request, Response } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { db, notifications } from '../db';
import { eq, sql } from 'drizzle-orm';

// GET — Meta webhook verification handshake
export function verifyWhatsAppWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || env.WHATSAPP_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }

  logger.warn({ mode, token }, 'WhatsApp webhook verification failed');
  return res.status(403).json({ error: 'Forbidden' });
}

// POST — incoming messages and status updates
export async function handleWhatsAppWebhook(req: Request, res: Response) {
  // Always ACK immediately — Meta retries if no 200 within 20s
  res.status(200).send('OK');

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        // Incoming messages
        for (const message of value.messages ?? []) {
          const fromRaw = String(message.from ?? '').trim();
          const from = fromRaw ? `whatsapp:+${fromRaw.replace(/^\+/, '')}` : '';
          const text = message.type === 'text'
            ? String(message.text?.body ?? '')
            : message.type === 'reaction'
              ? `:${String(message.reaction?.emoji ?? '')}`
              : message.type === 'image'
                ? '[image]'
                : message.type === 'audio'
                  ? '[audio]'
                  : message.type === 'video'
                    ? '[video]'
                    : message.type === 'document'
                      ? '[document]'
                      : message.type === 'location'
                        ? '[location]'
                        : `[${String(message.type ?? 'message')}]`;

          logger.info({
            from,
            type: message.type,
            text,
            messageId: message.id,
          }, 'Incoming WhatsApp message');

          try {
            await db.insert(notifications).values({
              channel: 'WHATSAPP',
              status: 'SENT',
              title: 'Incoming WhatsApp',
              body: text,
              recipient: from || null,
              data: {
                direction: 'inbound',
                provider: 'meta',
                waMessageId: message.id ?? null,
                from: from || null,
                toPhoneNumberId: value?.metadata?.phone_number_id ?? null,
                toDisplayNumber: value?.metadata?.display_phone_number ?? null,
                type: message.type ?? null,
              },
            });
          } catch (err) {
            logger.error({ err, messageId: message.id }, 'Failed to persist incoming WhatsApp message (Meta)');
          }
        }

        // Status updates (sent, delivered, read, failed)
        for (const status of value.statuses ?? []) {
          logger.info({
            to: status.recipient_id,
            status: status.status,
            messageId: status.id,
          }, 'WhatsApp message status update');

          const normalized = String(status.status ?? '').toLowerCase();
          const nextStatus = (normalized === 'delivered' || normalized === 'sent' || normalized === 'read')
            ? 'SENT'
            : (normalized === 'failed' || normalized === 'undelivered')
              ? 'FAILED'
              : null;

          if (status.id) {
            try {
              const meta = {
                waStatus: status.status ?? null,
                provider: 'meta',
                recipientId: status.recipient_id ?? null,
                timestamp: status.timestamp ?? null,
              };
              await db.update(notifications)
                .set({
                  ...(nextStatus ? { status: nextStatus } : {}),
                  data: sql`${notifications.data} || ${JSON.stringify(meta)}::jsonb`,
                } as any)
                .where(sql`${notifications.data}->>'waMessageId' = ${String(status.id)}`);
            } catch (err) {
              logger.error({ err, messageId: status.id }, 'Failed to update WhatsApp notification status (Meta)');
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error processing WhatsApp webhook payload');
  }
}
