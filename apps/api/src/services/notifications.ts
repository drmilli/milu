import { eq, sql } from 'drizzle-orm';
import { db, notifications, users, businessSettings, businesses } from '../db';
import { sendWhatsAppNotification } from './whatsapp';
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
  const brevoConfigured = !!(env.BREVO_SMTP_USER && env.BREVO_SMTP_PASSWORD);
  const gmailConfigured = !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);

  const wantBrevo = env.EMAIL_PROVIDER === 'brevo' || (env.EMAIL_PROVIDER === 'auto' && brevoConfigured);
  const wantGmail = env.EMAIL_PROVIDER === 'gmail' || (env.EMAIL_PROVIDER === 'auto' && !brevoConfigured && gmailConfigured);

  if (wantBrevo && brevoConfigured) {
    const host = env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com';
    const port = env.BREVO_SMTP_PORT ?? 587;
    const secure = port === 465;
    return nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: { user: env.BREVO_SMTP_USER, pass: env.BREVO_SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  if (wantGmail && gmailConfigured) {
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
        {
          const smtpAvailable = !!transport;
          const shouldUseSmtp = env.EMAIL_PROVIDER === 'gmail' || env.EMAIL_PROVIDER === 'brevo' || (env.EMAIL_PROVIDER === 'auto' && smtpAvailable);
          const shouldUseSendchamp = env.EMAIL_PROVIDER === 'sendchamp' || (env.EMAIL_PROVIDER === 'auto' && !smtpAvailable);
          let smtpFailedWithNetworkError = false;

          const from = parseFrom(env.EMAIL_FROM);
          const brevoApiKey = env.BREVO_API_KEY;
          const html = body.split('\n').map(line => `<p style="margin:0 0 12px;font-size:14px;color:#111;">${escapeHtml(line)}</p>`).join('');
          const brevoSenderEmail = env.BREVO_SENDER_EMAIL ?? from.email;
          const brevoSenderName = env.BREVO_SENDER_NAME ?? from.name;

          const sendBrevoApi = async () => {
            if (!brevoApiKey) throw new Error('BREVO_API_KEY not set');
            const res = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'api-key': brevoApiKey,
              },
              body: JSON.stringify({
                sender: { name: brevoSenderName, email: brevoSenderEmail },
                to: [{ email: recipient, name: recipient }],
                subject: title,
                htmlContent: html,
                textContent: body,
              }),
            });
            if (!res.ok) {
              const responseText = await res.text().catch(() => '');
              throw new Error(`Brevo API email failed (${res.status}): ${responseText}`);
            }
          };

          if (env.EMAIL_PROVIDER === 'auto' && brevoApiKey) {
            await sendBrevoApi();
            break;
          }

          if (shouldUseSmtp) {
            if (!transport) {
              logger.info({ to: recipient, title }, '[DEV] Email notification');
              if (env.EMAIL_PROVIDER === 'brevo' && brevoApiKey) {
                await sendBrevoApi();
                break;
              }
            } else {
              try {
                await transport.sendMail({ from: env.EMAIL_FROM, to: recipient, subject: title, text: body });
              } catch (err) {
                const e = err as any;
                const code = typeof e?.code === 'string' ? e.code : '';
                const shouldFallback = (env.EMAIL_PROVIDER === 'auto' || env.EMAIL_PROVIDER === 'brevo') && (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH');
                if (!shouldFallback) throw err;
                smtpFailedWithNetworkError = true;
              }
            }
            if (!smtpFailedWithNetworkError) break;
          }

          if (env.EMAIL_PROVIDER === 'brevo' && brevoApiKey && (smtpFailedWithNetworkError || !smtpAvailable)) {
            await sendBrevoApi();
            break;
          }

          if ((env.EMAIL_PROVIDER === 'sendchamp' || (env.EMAIL_PROVIDER === 'auto' && (smtpFailedWithNetworkError || !smtpAvailable))) && (env.SENDCHAMP_EMAIL_API_KEY || env.SENDCHAMP_API_KEY)) {
            const senderEmail = env.SENDCHAMP_SENDER_EMAIL ?? from.email;
            const senderName = env.SENDCHAMP_SENDER_NAME ?? from.name;

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
              break;
            }

            if (env.EMAIL_PROVIDER === 'sendchamp' && env.SENDCHAMP_API_KEY) {
              const mod: any = await import('sendchamp-sdk');
              const Sendchamp = mod?.default ?? mod?.Sendchamp ?? mod;
              const mode = env.SENDCHAMP_API_KEY.includes('live') ? 'live' : 'test';
              const client = typeof Sendchamp === 'function'
                ? (Sendchamp.prototype && Object.keys(Sendchamp.prototype).length > 0
                  ? new Sendchamp({ publicKey: env.SENDCHAMP_API_KEY, mode })
                  : Sendchamp({ publicKey: env.SENDCHAMP_API_KEY, mode }))
                : null;
              if (!client?.EMAIL?.send) throw new Error('Sendchamp SDK init failed');
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
              break;
            }
            break;
          }

          if (env.EMAIL_PROVIDER === 'sendchamp') {
            throw new Error('EMAIL_PROVIDER=sendchamp but no Sendchamp email configuration is available');
          }

          if (!transport) {
            logger.info({ to: recipient, title }, '[DEV] Email notification');
          } else {
            await transport.sendMail({ from: env.EMAIL_FROM, to: recipient, subject: title, text: body });
          }
          break;
        }

      case 'WHATSAPP':
        if (!recipient) throw new Error('recipient required for WHATSAPP');
        {
          const msg = await sendWhatsAppNotification(recipient, title, body);
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
  const [biz] = await db
    .select({ subscriptionTier: businesses.subscriptionTier, createdAt: businesses.createdAt })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  const billingTier = (biz?.subscriptionTier ?? 'STARTER') as 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  const isTrial = billingTier === 'STARTER' && !!biz?.createdAt && new Date() < new Date(biz.createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);
  const effectiveTier = isTrial ? 'GROWTH' : billingTier;

  const [settings] = await db.select().from(businessSettings).where(eq(businessSettings.businessId, businessId)).limit(1);
  const configured = (settings?.notifyChannels ?? ['EMAIL']) as Channel[];
  const channels = Array.from(new Set<Channel>(['EMAIL', ...configured]));
  const allowedChannels = effectiveTier === 'STARTER' ? ['EMAIL'] as Channel[] : channels;

  const owners = await db.select({ id: users.id, email: users.email }).from(users)
    .where(eq(users.businessId, businessId));

  for (const owner of owners) {
    for (const channel of allowedChannels) {
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
