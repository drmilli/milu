import { eq } from 'drizzle-orm';
import { db, notifications, users, businessSettings } from '../db';
import { sendWhatsAppText } from './whatsapp';
import { sendCustomSms } from './sms';
import { logger } from '../config/logger';
import nodemailer from 'nodemailer';
import { env } from '../config/env';

type Channel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';

interface SendOptions {
  businessId?: string;
  userId?: string;
  title: string;
  body: string;
  channel: Channel;
  recipient?: string;         // phone/email depending on channel
  data?: Record<string, unknown>;
}

function createTransport() {
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    });
  }
  return null;
}
const transport = createTransport();

export async function sendNotification(opts: SendOptions): Promise<void> {
  const { businessId, userId, title, body, channel, recipient, data = {} } = opts;

  // Persist to DB for all channels
  const [notif] = await db.insert(notifications).values({
    businessId,
    userId,
    channel,
    title,
    body,
    data,
    recipient,
    status: 'PENDING',
  }).returning();

  try {
    switch (channel) {
      case 'IN_APP':
        // Delivered via WebSocket push or polling — already persisted
        break;

      case 'EMAIL':
        if (!recipient) throw new Error('recipient required for EMAIL');
        if (!transport) {
          logger.info({ to: recipient, title }, '[DEV] Email notification');
        } else {
          await transport.sendMail({ from: env.EMAIL_FROM, to: recipient, subject: title, text: body });
        }
        break;

      case 'WHATSAPP':
        if (!recipient) throw new Error('recipient required for WHATSAPP');
        await sendWhatsAppText(recipient, `*${title}*\n\n${body}`);
        break;

      case 'SMS':
        if (!recipient) throw new Error('recipient required for SMS');
        await sendCustomSms(recipient, `${title}: ${body}`);
        break;
    }

    await db.update(notifications).set({ status: 'SENT' }).where(eq(notifications.id, notif.id));
  } catch (err) {
    logger.error({ err, channel }, 'Notification send failed');
    await db.update(notifications).set({ status: 'FAILED' }).where(eq(notifications.id, notif.id));
  }
}

export async function notifyBusinessOwners(businessId: string, title: string, body: string, data?: Record<string, unknown>) {
  const [settings] = await db.select().from(businessSettings).where(eq(businessSettings.businessId, businessId)).limit(1);
  const channels = (settings?.notifyChannels ?? ['EMAIL']) as Channel[];

  const owners = await db.select({ id: users.id, email: users.email }).from(users)
    .where(eq(users.businessId, businessId));

  for (const owner of owners) {
    for (const channel of channels) {
      await sendNotification({
        businessId,
        userId: owner.id,
        title,
        body,
        channel,
        recipient: channel === 'EMAIL' ? owner.email
          : channel === 'SMS' ? settings?.smsNumber ?? undefined
          : channel === 'WHATSAPP' ? settings?.whatsappNumber ?? undefined
          : undefined,
        data,
      });
    }
  }
}
