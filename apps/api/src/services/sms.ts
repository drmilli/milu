import { env } from '../config/env';
import { logger } from '../config/logger';

async function sendSms(to: string, message: string) {
  if (!env.AT_API_KEY || !env.AT_USERNAME) {
    logger.info({ to, message }, '[DEV] SMS (no AT credentials)');
    return;
  }

  const params = new URLSearchParams({
    username: env.AT_USERNAME,
    to,
    message,
  });

  const res = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      apiKey: env.AT_API_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AT SMS error ${res.status}: ${err}`);
  }
  return res.json();
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
