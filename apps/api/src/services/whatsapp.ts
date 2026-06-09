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
  const statusCallbackUrl = `${env.API_URL.replace(/\/$/, '')}/webhooks/twilio/message-status`;

  logger.info({
    to: maskPhone(toNormalized),
    from: maskPhone(fromNormalized),
    messageChars: message.length,
    statusCallbackUrl,
  }, 'WhatsApp send attempt (Twilio)');

  try {
    const msg = await client.messages.create({
      body: message,
      from: fromNormalized,
      to: toNormalized,
      statusCallback: statusCallbackUrl,
    });
    logger.info({
      to: maskPhone(toNormalized),
      sid: msg.sid,
      status: msg.status,
      errorCode: (msg as any).errorCode,
      errorMessage: (msg as any).errorMessage,
    }, 'WhatsApp sent (Twilio)');
    return { sid: msg.sid, status: msg.status, to: toNormalized, from: fromNormalized };
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

async function sendViaTwilioWhatsAppTemplate(to: string, contentSid: string, contentVariables: Record<string, string>) {
  const client = getTwilioClient();
  const fromRaw = env.TWILIO_WHATSAPP_FROM ?? env.TWILIO_PHONE_NUMBER;

  if (!client || !fromRaw) {
    if (env.NODE_ENV === 'production') {
      logger.error({
        twilioAccountSid: !!env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: !!env.TWILIO_AUTH_TOKEN,
        twilioWhatsAppFrom: !!env.TWILIO_WHATSAPP_FROM,
        twilioPhoneNumber: !!env.TWILIO_PHONE_NUMBER,
        contentSid: !!contentSid,
      }, 'Twilio WhatsApp template is not configured');
      throw new Error('Twilio WhatsApp template is not configured');
    }
    logger.info({ to, contentSid, contentVariables }, '[DEV] WhatsApp template (Twilio not configured)');
    return;
  }

  const normalize = (v: string) => (v.startsWith('whatsapp:') ? v : `whatsapp:${v}`);
  const toNormalized = normalize(to);
  const fromNormalized = normalize(fromRaw);
  const rawUrl = env.API_URL.replace(/\/$/, '');
  const statusCallbackUrl = rawUrl.startsWith('https://') ? `${rawUrl}/webhooks/twilio/message-status` : undefined;

  // Filter out empty/undefined values and ensure all values are strings
  const cleanedVariables: Record<string, string> = {};
  for (const [key, value] of Object.entries(contentVariables)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      cleanedVariables[key] = String(value).trim();
    }
  }

  // If no variables remain after cleaning, omit contentVariables entirely.
  // Twilio returns 21656 if you pass contentVariables to a fixed-text template with no placeholders.
  const hasVariables = Object.keys(cleanedVariables).length > 0;

  logger.info({
    to: maskPhone(toNormalized),
    from: maskPhone(fromNormalized),
    contentSid,
    statusCallbackUrl,
    contentVariables: hasVariables ? cleanedVariables : '(omitted — no-variable template)',
  }, 'WhatsApp template send attempt (Twilio)');

  try {
    const msg = await client.messages.create({
      from: fromNormalized,
      to: toNormalized,
      ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
      contentSid,
      ...(hasVariables ? { contentVariables: JSON.stringify(cleanedVariables) } : {}),
    } as any);
    logger.info({
      to: maskPhone(toNormalized),
      sid: msg.sid,
      status: msg.status,
      errorCode: (msg as any).errorCode,
      errorMessage: (msg as any).errorMessage,
    }, 'WhatsApp template sent (Twilio)');
    return { sid: msg.sid, status: msg.status, to: toNormalized, from: fromNormalized };
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
      contentSid,
      contentVariables: hasVariables ? cleanedVariables : '(omitted)',
    }, 'WhatsApp template send failed (Twilio)');
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

export async function sendWhatsAppOtp(to: string, code: string) {
  if (env.TWILIO_WHATSAPP_OTP_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_OTP_CONTENT_SID, { 
      '1': code || '000000', 
      '2': '10' 
    });
  }
  return sendWhatsAppText(to, `Your Milu verification code is *${code}*. It expires in 10 minutes.`);
}

export async function sendWhatsAppNotification(to: string, title: string, body: string) {
  if (env.TWILIO_WHATSAPP_NOTIFICATION_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_NOTIFICATION_CONTENT_SID, { 
      '1': title || 'Notification', 
      '2': body || '' 
    });
  }
  return sendWhatsAppText(to, `*${title}*\n\n${body}`);
}

export async function sendWhatsAppTemplate(to: string, templateName: string, languageCode = 'en', components: unknown[] = []) {
  return sendViaMeta(to, {
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  });
}

export async function sendOrderConfirmation(to: string, orderNumber: string, items: { name: string; qty: number }[], businessName: string) {
  const itemList = items.map((i) => `  • ${i.name} ×${i.qty}`).join('\n');
  if (env.TWILIO_WHATSAPP_ORDER_CONFIRM_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_ORDER_CONFIRM_CONTENT_SID, {
      '1': businessName || 'our business',
      '2': orderNumber || 'N/A',
      '3': itemList || '—',
    });
  }
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
  if (env.TWILIO_WHATSAPP_ORDER_STATUS_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_ORDER_STATUS_CONTENT_SID, {
      '1': orderNumber || 'N/A',
      '2': msg,
      '3': businessName || 'our business',
    });
  }
  return sendWhatsAppText(to,
    `📦 *Order Update — #${orderNumber}*\n\n` +
    `${msg}\n\n` +
    `*${businessName}*\nReply to this message for assistance.`
  );
}

export async function sendAppointmentReminder(to: string, service: string, dateTime: string, businessName: string) {
  if (env.TWILIO_WHATSAPP_APPOINTMENT_REMINDER_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_APPOINTMENT_REMINDER_CONTENT_SID, {
      '1': businessName,
      '2': service,
      '3': dateTime,
    });
  }
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
  if (env.TWILIO_WHATSAPP_APPOINTMENT_CONFIRM_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_APPOINTMENT_CONFIRM_CONTENT_SID, {
      '1': businessName,
      '2': service,
      '3': dateTime,
    });
  }
  return sendWhatsAppText(to,
    `✅ *Appointment Confirmed!*\n\n` +
    `Your appointment with *${businessName}* is confirmed.\n\n` +
    `*Service:* ${service}\n` +
    `*Date & Time:* ${dateTime}\n\n` +
    `We'll send you a reminder closer to your appointment. See you soon! 👋`
  );
}

export async function sendEscalationAlert(to: string, callerNumber: string, summary: string) {
  if (env.TWILIO_WHATSAPP_ESCALATION_ALERT_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_ESCALATION_ALERT_CONTENT_SID, {
      '1': callerNumber,
      '2': summary,
    });
  }
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
  if (env.TWILIO_WHATSAPP_CALLBACK_REQUEST_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_CALLBACK_REQUEST_CONTENT_SID, {
      '1': businessName,
      '2': callerNumber,
    });
  }
  return sendWhatsAppText(to,
    `📞 *Callback Request*\n\n` +
    `A customer has requested a callback from *${businessName}*.\n\n` +
    `*Customer number:* ${callerNumber}\n\n` +
    `Please call them back at your earliest convenience.\n\n` +
    `_Powered by Milu AI_`
  );
}

export async function sendMissedCallAlert(to: string, callerNumber: string, businessName: string) {
  if (env.TWILIO_WHATSAPP_MISSED_CALL_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_MISSED_CALL_CONTENT_SID, {
      '1': businessName,
      '2': callerNumber,
    });
  }
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
  if (env.TWILIO_WHATSAPP_WEEKLY_SUMMARY_CONTENT_SID) {
    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_WEEKLY_SUMMARY_CONTENT_SID, {
      '1': businessName,
      '2': String(stats.totalCalls),
      '3': String(stats.resolved),
      '4': resolutionRate,
      '5': String(stats.escalated),
      '6': String(stats.avgDuration),
    });
  }
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

export async function sendBroadcastMessage(
  to: string,
  contactName: string,
  businessName: string,
  messageBody: string,
  businessContactPhone: string,
  title?: string,
) {
  if (env.TWILIO_WHATSAPP_BROADCAST_CONTENT_SID) {
    // Template: "Hello {{1}}, you have a message from {{2}}. {{3}} Reply or call us on {{4}}"
    // {{1}} = contact name
    // {{2}} = business name
    // {{3}} = title (if any) + body
    // {{4}} = business contact phone
    const bodyWithTitle = title?.trim()
      ? `*${title.trim()}* ${messageBody}`
      : messageBody;

    const templateVars: Record<string, string> = {
      '1': contactName || 'there',
      '2': businessName || 'our business',
      '3': bodyWithTitle.replace(/\n+/g, ' ').trim(),
      '4': businessContactPhone?.trim() || businessName || 'us',
    };

    return sendViaTwilioWhatsAppTemplate(to, env.TWILIO_WHATSAPP_BROADCAST_CONTENT_SID, templateVars);
  }
  // Fallback: plain text if template SID not configured
  const bodyWithTitle = title?.trim() ? `*${title.trim()}*\n\n${messageBody}` : messageBody;
  return sendWhatsAppText(
    to,
    `Hello ${contactName}, this is a message from *${businessName}*.\n\n${bodyWithTitle}\n\nReply or call us on ${businessContactPhone} — we are happy to help.`,
  );
}
