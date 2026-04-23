import { eq, sql } from 'drizzle-orm';
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

function parseFrom(value: string) {
  const trimmed = value.trim();
  const m = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim() || 'Milu', email: m[2].trim() };
  return { name: 'Milu', email: trimmed };
}

function createTransport() {
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
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
        if (env.SENDCHAMP_API_KEY) {
          const from = parseFrom(env.EMAIL_FROM);
          const senderEmail = env.SENDCHAMP_SENDER_EMAIL ?? from.email;
          const senderName = env.SENDCHAMP_SENDER_NAME ?? from.name;

          const res = await fetch('https://api.bunce.so/v1/messaging/transactional/send/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': env.SENDCHAMP_API_KEY,
            },
            body: JSON.stringify({
              sender_email: senderEmail,
              sender_name: senderName,
              email: recipient,
              message_type: 'transactional',
              subject: title,
              text: body,
            }),
          });

          if (!res.ok) {
            const responseText = await res.text().catch(() => '');
            throw new Error(`Sendchamp email failed (${res.status}): ${responseText}`);
          }
        } else if (!transport) {
          logger.info({ to: recipient, title }, '[DEV] Email notification');
        } else {
          await transport.sendMail({ from: env.EMAIL_FROM, to: recipient, subject: title, text: body });
        }
        break;

      case 'WHATSAPP':
        if (!recipient) throw new Error('recipient required for WHATSAPP');
        {
          const msg = await sendWhatsAppText(recipient, `*${title}*\n\n${body}`);
          if (msg?.sid) {
            const meta = { direction: 'outbound', twilioSid: msg.sid, to: msg.to, from: msg.from, status: msg.status };
            await db.update(notifications).set({
              data: sql`${notifications.data} || ${JSON.stringify(meta)}::jsonb`,
            }).where(eq(notifications.id, notif.id));
          }
        }
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
  const configured = (settings?.notifyChannels ?? ['EMAIL']) as Channel[];
  const channels = Array.from(new Set<Channel>(['EMAIL', ...configured]));

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
