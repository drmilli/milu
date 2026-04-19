import type { Request, Response } from 'express';
import { logger } from '../config/logger';
import { env } from '../config/env';

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
          logger.info({
            from: message.from,
            type: message.type,
            text: message.text?.body,
            messageId: message.id,
          }, 'Incoming WhatsApp message');
          // TODO: route to AI agent conversation handler
        }

        // Status updates (sent, delivered, read, failed)
        for (const status of value.statuses ?? []) {
          logger.info({
            to: status.recipient_id,
            status: status.status,
            messageId: status.id,
          }, 'WhatsApp message status update');
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error processing WhatsApp webhook payload');
  }
}
