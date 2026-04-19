import { env } from '../config/env';
import { logger } from '../config/logger';

const API_URL = 'https://graph.facebook.com/v21.0';

async function send(to: string, body: Record<string, unknown>) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    logger.info({ to, body }, '[DEV] WhatsApp message (no credentials)');
    return;
  }
  // WhatsApp Cloud API requires E.164 without the leading +
  const normalizedTo = to.replace(/^\+/, '');
  const res = await fetch(`${API_URL}/${env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: normalizedTo, ...body }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function sendWhatsAppText(to: string, message: string) {
  return send(to, { type: 'text', text: { body: message } });
}

export async function sendWhatsAppTemplate(to: string, templateName: string, languageCode = 'en', components: unknown[] = []) {
  return send(to, {
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  });
}

export async function sendOrderConfirmation(to: string, orderNumber: string, items: { name: string; qty: number }[]) {
  const itemList = items.map((i) => `• ${i.name} x${i.qty}`).join('\n');
  return sendWhatsAppText(
    to,
    `✅ *Order Confirmed!*\n\nOrder #${orderNumber}\n\n${itemList}\n\nWe'll update you when your order is ready. Reply to this message for help.`,
  );
}

export async function sendAppointmentReminder(to: string, service: string, dateTime: string, businessName: string) {
  return sendWhatsAppText(
    to,
    `📅 *Appointment Reminder*\n\n${businessName}\n\nService: ${service}\nDate/Time: ${dateTime}\n\nReply "CONFIRM" to confirm or "CANCEL" to cancel.`,
  );
}

export async function sendEscalationAlert(to: string, callerNumber: string, summary: string) {
  return sendWhatsAppText(
    to,
    `🔔 *Escalation Alert*\n\nA caller (${callerNumber}) needs your attention.\n\n${summary}\n\nPlease call them back as soon as possible.`,
  );
}
