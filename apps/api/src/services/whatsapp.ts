import { env } from '../config/env';
import { logger } from '../config/logger';
import twilio from 'twilio';

const API_URL = 'https://graph.facebook.com/v21.0';

function maskPhone(value: string) {
  const cleaned = value.replace(/^whatsapp:/, '');
  const last4 = cleaned.slice(-4);
  const prefix = cleaned.slice(0, Math.max(0, cleaned.length - 4));
  const maskedPrefix = prefix.replace(/\d/g, '*');
  return `${maskedPrefix}${last4}`;
}

function getTwilioClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

async function sendViaTwilioWhatsApp(to: string, message: string) {
  const client = getTwilioClient();
  const fromRaw = env.TWILIO_WHATSAPP_FROM ?? env.TWILIO_PHONE_NUMBER;

  if (!client || !fromRaw) {
    if (env.NODE_ENV === 'production') {
      logger.error({
        twilioAccountSid: !!env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: !!env.TWILIO_AUTH_TOKEN,
        twilioWhatsAppFrom: !!env.TWILIO_WHATSAPP_FROM,
        twilioPhoneNumber: !!env.TWILIO_PHONE_NUMBER,
      }, 'Twilio WhatsApp is not configured');
      throw new Error('Twilio WhatsApp is not configured');
    }
    logger.info({ to, message }, '[DEV] WhatsApp (Twilio not configured)');
    return;
  }

  const normalize = (v: string) => (v.startsWith('whatsapp:') ? v : `whatsapp:${v}`);
  const toNormalized = normalize(to);
  const fromNormalized = normalize(fromRaw);

  logger.info({
    to: maskPhone(toNormalized),
    from: maskPhone(fromNormalized),
    messageChars: message.length,
  }, 'WhatsApp send attempt (Twilio)');

  try {
    const msg = await client.messages.create({
      body: message,
      from: fromNormalized,
      to: toNormalized,
    });
    logger.info({
      to: maskPhone(toNormalized),
      sid: msg.sid,
      status: msg.status,
      errorCode: (msg as any).errorCode,
      errorMessage: (msg as any).errorMessage,
    }, 'WhatsApp sent (Twilio)');
  } catch (err) {
    const e = err as any;
    logger.error({
      err: e,
      to: maskPhone(toNormalized),
      from: maskPhone(fromNormalized),
      twilio: {
        code: e?.code,
        status: e?.status,
        moreInfo: e?.moreInfo,
        details: e?.details,
      },
    }, 'WhatsApp send failed (Twilio)');
    throw err;
  }
}

async function sendViaMeta(to: string, body: Record<string, unknown>) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    logger.info({ to, body }, '[DEV] WhatsApp message (no credentials)');
    return;
  }
  const normalizedTo = to.replace(/^\+/, '');
  const res = await fetch(`${API_URL}/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: normalizedTo, ...body }),
  });
  const responseText = await res.text();
  if (!res.ok) {
    logger.error({ to, status: res.status, response: responseText }, 'WhatsApp Meta API error');
    throw new Error(`WhatsApp Meta API error ${res.status}: ${responseText}`);
  }
  logger.info({ to, response: responseText }, 'WhatsApp message sent via Meta');
  return JSON.parse(responseText);
}

export async function sendWhatsAppText(to: string, message: string) {
  return sendViaTwilioWhatsApp(to, message);
}

export async function sendWhatsAppTemplate(to: string, templateName: string, languageCode = 'en', components: unknown[] = []) {
  return sendViaMeta(to, {
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  });
}

export async function sendOrderConfirmation(to: string, orderNumber: string, items: { name: string; qty: number }[], businessName: string) {
  const itemList = items.map((i) => `  • ${i.name} ×${i.qty}`).join('\n');
  return sendWhatsAppText(to,
    `✅ *Order Confirmed!*\n\n` +
    `Hi! Your order has been received by *${businessName}*.\n\n` +
    `*Order #${orderNumber}*\n${itemList}\n\n` +
    `We'll send you an update when your order is ready. Reply to this message if you need help.`
  );
}

export async function sendOrderStatusUpdate(to: string, orderNumber: string, status: string, businessName: string) {
  const statusMessages: Record<string, string> = {
    CONFIRMED: '✅ Your order has been confirmed and is being prepared.',
    PROCESSING: '🔄 Your order is currently being processed.',
    COMPLETED: '🎉 Your order is ready! Please come pick it up or expect delivery soon.',
    CANCELLED: '❌ Your order has been cancelled. Contact us if this was a mistake.',
  };
  const msg = statusMessages[status] ?? `Your order status has been updated to: ${status}`;
  return sendWhatsAppText(to,
    `📦 *Order Update — #${orderNumber}*\n\n` +
    `${msg}\n\n` +
    `*${businessName}*\nReply to this message for assistance.`
  );
}

export async function sendAppointmentReminder(to: string, service: string, dateTime: string, businessName: string) {
  return sendWhatsAppText(to,
    `📅 *Appointment Reminder*\n\n` +
    `You have an upcoming appointment with *${businessName}*.\n\n` +
    `*Service:* ${service}\n` +
    `*Date & Time:* ${dateTime}\n\n` +
    `Reply *CONFIRM* to confirm or *CANCEL* to cancel.\n\n` +
    `Need to reschedule? Reply to this message.`
  );
}

export async function sendAppointmentConfirmation(to: string, service: string, dateTime: string, businessName: string) {
  return sendWhatsAppText(to,
    `✅ *Appointment Confirmed!*\n\n` +
    `Your appointment with *${businessName}* is confirmed.\n\n` +
    `*Service:* ${service}\n` +
    `*Date & Time:* ${dateTime}\n\n` +
    `We'll send you a reminder closer to your appointment. See you soon! 👋`
  );
}

export async function sendEscalationAlert(to: string, callerNumber: string, summary: string) {
  return sendWhatsAppText(to,
    `🔔 *Action Required — Call Escalation*\n\n` +
    `Your AI agent has escalated a call that needs your personal attention.\n\n` +
    `*Caller:* ${callerNumber}\n` +
    `*Reason:* ${summary}\n\n` +
    `Please call them back as soon as possible.\n\n` +
    `_Powered by Milu AI_`
  );
}

export async function sendCallbackRequest(to: string, callerNumber: string, businessName: string) {
  return sendWhatsAppText(to,
    `📞 *Callback Request*\n\n` +
    `A customer has requested a callback from *${businessName}*.\n\n` +
    `*Customer number:* ${callerNumber}\n\n` +
    `Please call them back at your earliest convenience.\n\n` +
    `_Powered by Milu AI_`
  );
}

export async function sendMissedCallAlert(to: string, callerNumber: string, businessName: string) {
  return sendWhatsAppText(to,
    `📵 *Missed Call Alert*\n\n` +
    `Your AI agent missed a call on *${businessName}*.\n\n` +
    `*Caller:* ${callerNumber}\n\n` +
    `Consider calling them back to avoid losing a customer.\n\n` +
    `_Powered by Milu AI_`
  );
}

export async function sendWeeklySummary(to: string, businessName: string, stats: {
  totalCalls: number;
  resolved: number;
  escalated: number;
  avgDuration: number;
}) {
  const resolutionRate = stats.totalCalls > 0
    ? ((stats.resolved / stats.totalCalls) * 100).toFixed(1)
    : '0';
  return sendWhatsAppText(to,
    `📊 *Weekly Summary — ${businessName}*\n\n` +
    `Here's how your AI agent performed this week:\n\n` +
    `📞 Total Calls: *${stats.totalCalls}*\n` +
    `✅ AI Resolved: *${stats.resolved}* (${resolutionRate}%)\n` +
    `🔔 Escalated: *${stats.escalated}*\n` +
    `⏱ Avg Call Duration: *${stats.avgDuration}s*\n\n` +
    `Keep it up! View full analytics on your dashboard.\n\n` +
    `_Milu AI · dashboard.miluai.app_`
  );
}
