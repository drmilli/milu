import { env } from '../config/env';
import { logger } from '../config/logger';

const BASE_URL = 'https://api.sendchamp.com/api/v1';

async function request(method: string, path: string, body?: unknown) {
  if (!env.SENDCHAMP_API_KEY) throw new Error('SENDCHAMP_API_KEY not set');
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.SENDCHAMP_API_KEY}`,
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    logger.error({ status: res.status, path, response: text }, 'Sendchamp API error');
    throw new Error(`Sendchamp error ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

export async function sendchampWhatsApp(to: string, message: string): Promise<void> {
  const normalised = to.replace(/^\+/, '');
  await request('POST', '/whatsapp/message/send', {
    sender: env.SENDCHAMP_WHATSAPP_SENDER,
    recipient: normalised,
    type: 'text',
    message,
  });
  logger.info({ to }, 'WhatsApp sent via Sendchamp');
}

// ─── OTP (native — Sendchamp handles generate + send + verify) ───────────────

export async function sendchampSendOtp(phone: string, channel: 'whatsapp' | 'sms' | 'voice' = 'whatsapp'): Promise<string> {
  const normalised = phone.replace(/^\+/, '');
  const data = await request('POST', '/verification/create', {
    channel,
    sender: channel === 'sms' ? (env.SENDCHAMP_SENDER_ID ?? 'Milu') : env.SENDCHAMP_WHATSAPP_SENDER,
    token_type: 'numeric',
    token_length: 6,
    expiration_time: 10,
    customer_mobile_number: normalised,
  });
  // Returns a reference used for verification
  return (data?.data?.reference ?? data?.reference ?? '') as string;
}

export async function sendchampVerifyOtp(reference: string, code: string): Promise<boolean> {
  try {
    const data = await request('POST', '/verification/confirm', {
      verification_reference: reference,
      verification_otp: code,
    });
    return data?.code === 200 || data?.status === 'success';
  } catch {
    return false;
  }
}

// ─── Voice (outbound text-to-speech) ─────────────────────────────────────────

export async function sendchampVoice(phones: string[], message: string, repeat = 1): Promise<void> {
  const normalised = phones.map(p => p.replace(/^\+/, ''));
  await request('POST', '/voice/send', {
    customer_mobile_number: normalised,
    message,
    type: 'outgoing',
    repeat,
  });
  logger.info({ phones }, 'Voice call sent via Sendchamp');
}
