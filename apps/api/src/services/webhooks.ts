import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, webhookConfigs } from '../db';
import { logger } from '../config/logger';

export async function dispatchWebhook(businessId: string, event: string, payload: Record<string, unknown>) {
  const configs = await db.select().from(webhookConfigs).where(eq(webhookConfigs.businessId, businessId));

  for (const config of configs) {
    if (!config.isActive) continue;
    if (config.events.length && !config.events.includes(event) && !config.events.includes('*')) continue;

    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const sig = crypto.createHmac('sha256', config.secret).update(body).digest('hex');

    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Milu-Signature': sig,
          'X-Milu-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      await db.update(webhookConfigs)
        .set({ lastTriggeredAt: new Date() })
        .where(eq(webhookConfigs.id, config.id));

      logger.info({ event, url: config.url, status: res.status }, 'Webhook dispatched');
    } catch (err) {
      logger.error({ event, url: config.url, err }, 'Webhook dispatch failed');
    }
  }
}
