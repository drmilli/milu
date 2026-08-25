import { eq } from 'drizzle-orm';
import { db, phoneNumbers } from '../db';
import { normalizePhone } from '../utils/phone';

/**
 * Warm-transfer helpers shared by the streaming (`twilio-stream`) and gather
 * (`twilio-voice`) call paths.
 *
 * Escalation is a *transfer*, not a hangup: the caller stays on the line while
 * Twilio dials the business's escalation number and bridges the two legs. The
 * `<Dial action=...>` callback then finalises the call record based on whether
 * a human actually picked up.
 */

export function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Caller ID to present to the human answering the transfer.
 *
 * Only the business's *Twilio* number qualifies: Twilio rejects a `callerId` it
 * does not own or have verified (error 13214), which would fail the entire dial.
 * A business whose number came from Africa's Talking or Infobip therefore gets
 * `null` here — callers must omit the `callerId` attribute in that case, letting
 * Twilio default to the original caller's number, which is always valid.
 */
export async function resolveTransferCallerId(businessId: string): Promise<string | null> {
  const rows = await db
    .select({ number: phoneNumbers.number, provider: phoneNumbers.provider })
    .from(phoneNumbers)
    .where(eq(phoneNumbers.businessId, businessId))
    .catch(() => [] as { number: string; provider: string | null }[]);

  const twilioNumber = rows.find(r => r.provider === 'twilio')?.number;
  return twilioNumber ? normalizePhone(twilioNumber) : null;
}

/**
 * Builds the `<Dial>` verb that bridges the caller to a human.
 *
 * `answerOnBridge` keeps the caller on ringback (rather than dead air) until the
 * human actually answers, and stops Twilio from marking the leg answered early.
 */
export function buildDialVerb(opts: {
  escalationNumber: string;
  callerId: string | null;
  callId: string;
  baseUrl: string;
  timeoutSeconds?: number;
}): string {
  const action = `${opts.baseUrl.replace(/\/$/, '')}/webhooks/twilio/voice/transfer-status?callId=${encodeURIComponent(opts.callId)}`;
  const callerIdAttr = opts.callerId ? ` callerId="${escapeXml(opts.callerId)}"` : '';
  const target = escapeXml(normalizePhone(opts.escalationNumber));

  return (
    `<Dial action="${escapeXml(action)}" method="POST"` +
    ` timeout="${opts.timeoutSeconds ?? 25}" answerOnBridge="true"${callerIdAttr}>` +
    `<Number>${target}</Number>` +
    `</Dial>`
  );
}

/** True when Twilio's `DialCallStatus` means a human actually picked up. */
export function transferConnected(dialCallStatus: string): boolean {
  return dialCallStatus === 'completed' || dialCallStatus === 'answered';
}
