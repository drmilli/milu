import { env } from '../config/env';
import { logger } from '../config/logger';

function getSdk() {
  if (!env.SENDCHAMP_API_KEY) throw new Error('SENDCHAMP_API_KEY not set');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('sendchamp-sdk');
  const Sendchamp = mod.default ?? mod.Sendchamp ?? mod;
  return new Sendchamp({ publicKey: env.SENDCHAMP_API_KEY, mode: 'live' });
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

export async function sendchampWhatsApp(to: string, message: string): Promise<void> {
  const sdk = getSdk();
  const normalised = to.replace(/^\+/, '');
  const whatsapp = sdk.WhatsApp();
  await whatsapp.sendText({
    sender: env.SENDCHAMP_WHATSAPP_SENDER ?? '',
    recipient: normalised,
    message,
  });
  logger.info({ to }, 'WhatsApp sent via Sendchamp SDK');
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

export async function sendchampSendOtp(phone: string, channel: 'whatsapp' | 'sms' | 'voice' = 'whatsapp'): Promise<string> {
  const sdk = getSdk();
  const normalised = phone.replace(/^\+/, '');
  const verification = sdk.Verification();
  const res = await verification.create({
    channel: channel.toUpperCase(),
    sender: channel === 'sms' ? (env.SENDCHAMP_SENDER_ID ?? 'Milu') : (env.SENDCHAMP_WHATSAPP_SENDER ?? ''),
    token_type: 'numeric',
    token_length: 6,
    expiration_time: 10,
    customer_mobile_number: normalised,
  });
  const reference = res?.data?.reference ?? res?.reference ?? '';
  logger.info({ phone, reference }, 'OTP sent via Sendchamp SDK');
  return reference as string;
}

export async function sendchampVerifyOtp(reference: string, code: string): Promise<boolean> {
  try {
    const sdk = getSdk();
    const verification = sdk.Verification();
    const res = await verification.verifyOTP({
      verification_reference: reference,
      verification_code: code,
    });
    return res?.code === 200 || res?.status === 'success';
  } catch {
    return false;
  }
}

// ─── Voice (outbound text-to-speech) ─────────────────────────────────────────

export async function sendchampVoice(phones: string[], message: string, repeat = 1): Promise<void> {
  const sdk = getSdk();
  const normalised = phones.map(p => p.replace(/^\+/, ''));
  const voice = sdk.Voice();
  await voice.sendVoice({
    customer_mobile_number: normalised,
    message,
    type: 'outgoing',
    repeat,
  });
  logger.info({ phones }, 'Voice call sent via Sendchamp SDK');
}
