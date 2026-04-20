import { env } from '../config/env';
import { logger } from '../config/logger';

const base = () => `https://${env.INFOBIP_BASE_URL}`;
const headers = () => ({
  Authorization: `App ${env.INFOBIP_API_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!env.INFOBIP_API_KEY || !env.INFOBIP_BASE_URL) {
    throw new Error('Infobip credentials not configured. Set INFOBIP_API_KEY and INFOBIP_BASE_URL in Railway env vars.');
  }
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    logger.error({ status: res.status, path, response: text }, 'Infobip API error');
    throw new Error(`Infobip error ${res.status}: ${text}`);
  }
  logger.debug({ method, path, status: res.status }, 'Infobip API call');
  return JSON.parse(text);
}

export interface AvailableNumber {
  numberKey: string;
  number: string;
  country: string;
  type: string;
  capabilities: string[];
  pricePerMonth: number;
  currency: string;
}

export async function searchAvailableNumbers(countryCode: string): Promise<AvailableNumber[]> {
  const data = await request<{ available: AvailableNumber[] }>(
    'GET',
    `/numbers/1/numbers/available?countryCode=${countryCode}&capabilities=VOICE&size=10`,
  );
  return data.available ?? [];
}

export interface PurchasedNumber {
  numberKey: string;
  number: string;
  country: string;
  type: string;
}

export async function purchaseNumber(numberKey: string): Promise<PurchasedNumber> {
  const webhookUrl = `${env.API_URL}/webhooks/infobip/voice`;
  const data = await request<PurchasedNumber>('POST', '/numbers/1/numbers', {
    numberKey,
    voice: {
      url: webhookUrl,
      method: 'POST',
    },
  });
  logger.info({ numberKey, number: data.number }, 'Infobip virtual number purchased');
  return data;
}

export async function releaseNumber(numberKey: string): Promise<void> {
  await request('DELETE', `/numbers/1/numbers/${numberKey}`);
  logger.info({ numberKey }, 'Infobip virtual number released');
}

export async function sendInfobipSms(to: string, message: string): Promise<void> {
  await request('POST', '/sms/2/text/advanced', {
    messages: [{
      from: 'Milu',
      destinations: [{ to }],
      text: message,
    }],
  });
}

export async function sendInfobipWhatsApp(to: string, message: string): Promise<void> {
  await request('POST', '/whatsapp/1/message/text', {
    from: env.INFOBIP_WHATSAPP_SENDER,
    to,
    content: { text: message },
  });
}
