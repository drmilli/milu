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

function isBunceKey(value?: string) {
  return typeof value === 'string' && /^sk_(live|test)_/i.test(value);
}

let warnedInvalidBunceEmailKey = false;

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendNotification(opts: SendOptions): Promise<void> {
  const { businessId, userId, title, body, channel, recipient, data = {} } = opts;

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
        break;

      case 'EMAIL':
        if (!recipient) throw new Error('recipient required for EMAIL');
        if (env.SENDCHAMP_EMAIL_API_KEY || env.SENDCHAMP_API_KEY) {
          const from = parseFrom(env.EMAIL_FROM);
          const senderEmail = env.SENDCHAMP_SENDER_EMAIL ?? from.email;
          const senderName = env.SENDCHAMP_SENDER_NAME ?? from.name;
          const html = body.split('\n').map(line => `<p style="margin:0 0 12px;font-size:14px;color:#111;">${escapeHtml(line)}</p>`).join('');

          if (env.SENDCHAMP_EMAIL_API_KEY && !isBunceKey(env.SENDCHAMP_EMAIL_API_KEY) && !warnedInvalidBunceEmailKey) {
            warnedInvalidBunceEmailKey = true;
            logger.warn('Invalid SENDCHAMP_EMAIL_API_KEY format; expected sk_live_... or sk_test_...');
          }

          const bunceKeyFrom = isBunceKey(env.SENDCHAMP_EMAIL_API_KEY)
            ? 'SENDCHAMP_EMAIL_API_KEY'
            : isBunceKey(env.SENDCHAMP_API_KEY)
              ? 'SENDCHAMP_API_KEY'
              : undefined;

          const bunceKey = bunceKeyFrom === 'SENDCHAMP_EMAIL_API_KEY'
            ? env.SENDCHAMP_EMAIL_API_KEY
            : bunceKeyFrom === 'SENDCHAMP_API_KEY'
              ? env.SENDCHAMP_API_KEY
              : undefined;

          if (bunceKey) {
            const res = await fetch('https://api.bunce.so/v1/messaging/transactional/send/email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': bunceKey,
              },
              body: JSON.stringify({
                sender_email: senderEmail,
                sender_name: senderName,
                email: recipient,
                message_type: 'transactional',
                subject: title,
                html,
              }),
            });

            if (!res.ok) {
              const responseText = await res.text().catch(() => '');
              throw new Error(`Bunce email failed (${res.status}) [${bunceKeyFrom ?? 'unknown-key'}]: ${responseText}`);
            }
          } else {
            if (!env.SENDCHAMP_API_KEY) throw new Error('SENDCHAMP_API_KEY not set');
            const mod: any = await import('sendchamp-sdk');
            const Sendchamp = mod.default ?? mod.Sendchamp ?? mod;
            const mode = env.SENDCHAMP_API_KEY.includes('live') ? 'live' : 'test';
            const client = new Sendchamp({ publicKey: env.SENDCHAMP_API_KEY, mode });
            const email = client.EMAIL;

            const res = await email.send({
              subject: title,
              to: [{ email: recipient, name: recipient }],
              from: { email: senderEmail, name: senderName },
              message_body: { type: 'html', value: html },
            });

            if (res?.status !== 'success') {
              throw new Error(`Sendchamp email failed (${res?.code ?? 'unknown'}): ${res?.message ?? 'Unknown error'}`);
            }
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
