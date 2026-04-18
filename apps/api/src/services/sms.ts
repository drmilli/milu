import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';

function getClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

async function sendSms(to: string, message: string) {
  const client = getClient();
  if (!client || !env.TWILIO_PHONE_NUMBER) {
    logger.info({ to, message }, '[DEV] SMS (no Twilio credentials)');
    return;
  }

  await client.messages.create({
    body: message,
    from: env.TWILIO_PHONE_NUMBER,
    to,
  });
}

export async function sendOrderSms(to: string, orderNumber: string) {
  return sendSms(to, `Milu: Your order #${orderNumber} has been received. We will contact you shortly.`);
}

export async function sendAppointmentSms(to: string, service: string, dateTime: string) {
  return sendSms(to, `Milu: Appointment reminder - ${service} on ${dateTime}. Reply CONFIRM or CANCEL.`);
}

export async function sendCallbackSms(to: string, businessName: string) {
  return sendSms(to, `${businessName}: We received your callback request. An agent will call you shortly.`);
}

export async function sendCustomSms(to: string, message: string) {
  return sendSms(to, message);
}
