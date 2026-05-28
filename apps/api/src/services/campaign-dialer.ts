import twilio from 'twilio';
import { eq, and, sql } from 'drizzle-orm';
import { db, campaigns, campaignContacts, calls } from '../db';
import { env } from '../config/env';
import { logger } from '../config/logger';

const DIAL_DELAY_MS = 3000; // 3 seconds between calls to avoid flooding

export async function startCampaign(campaignId: string, businessId: string, fromNumber: string | null) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    logger.error({ campaignId }, 'Twilio credentials missing — cannot start campaign');
    return;
  }
  if (!fromNumber) {
    logger.error({ campaignId, businessId }, 'No phone number for business — cannot start campaign');
    await db.update(campaigns).set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    return;
  }

  const pendingContacts = await db.select().from(campaignContacts)
    .where(and(eq(campaignContacts.campaignId, campaignId), eq(campaignContacts.status, 'PENDING')));

  logger.info({ campaignId, total: pendingContacts.length }, 'Starting campaign dialer');

  for (const contact of pendingContacts) {
    // Re-check campaign is still RUNNING
    const [current] = await db.select({ status: campaigns.status }).from(campaigns)
      .where(eq(campaigns.id, campaignId)).limit(1);
    if (current?.status !== 'RUNNING') {
      logger.info({ campaignId }, 'Campaign no longer running — stopping dialer');
      break;
    }

    await dialContact(contact, campaignId, businessId, fromNumber);

    if (contact !== pendingContacts[pendingContacts.length - 1]) {
      await new Promise(r => setTimeout(r, DIAL_DELAY_MS));
    }
  }

  // Mark campaign completed
  await db.update(campaigns).set({
    status: 'COMPLETED',
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId));

  logger.info({ campaignId }, 'Campaign dialing completed');
}

async function dialContact(
  contact: { id: string; name: string | null; phoneNumber: string },
  campaignId: string,
  businessId: string,
  fromNumber: string,
) {
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  const baseUrl = env.API_URL;

  // Create call record before dialing so we have an ID for the TwiML
  const [callRow] = await db.insert(calls).values({
    businessId,
    callerNumber: contact.phoneNumber,
    callerName: contact.name,
    direction: 'OUTBOUND',
    campaignContactId: contact.id,
    status: 'ACTIVE',
  }).returning({ id: calls.id });

  if (!callRow) {
    logger.error({ contactId: contact.id }, 'Failed to create call record');
    return;
  }

  await db.update(campaignContacts).set({ status: 'CALLING', calledAt: new Date() })
    .where(eq(campaignContacts.id, contact.id));

  await db.update(campaigns).set({
    dialedCount: sql`${campaigns.dialedCount} + 1`,
    updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId));

  try {
    const twimlUrl = `${baseUrl}/api/v1/twilio/voice/outbound?callId=${encodeURIComponent(callRow.id)}`;
    const statusUrl = `${baseUrl}/webhooks/twilio/voice/status`;

    await client.calls.create({
      to: contact.phoneNumber,
      from: fromNumber,
      url: twimlUrl,
      statusCallback: statusUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
      machineDetection: 'Enable',
      asyncAmd: 'false',
    });

    logger.info({ callId: callRow.id, to: contact.phoneNumber, campaignId }, 'Outbound call initiated');
  } catch (err) {
    logger.error({ err, contactId: contact.id, callId: callRow.id }, 'Failed to initiate outbound call');
    await db.update(campaignContacts).set({ status: 'FAILED', notes: String(err) })
      .where(eq(campaignContacts.id, contact.id));
    await db.update(calls).set({ status: 'FAILED', endedAt: new Date() })
      .where(eq(calls.id, callRow.id));
  }
}

export async function handleOutboundCallStatus(
  callId: string,
  twilioStatus: string,
  answeredBy?: string,
) {
  const [callRow] = await db.select({ id: calls.id, campaignContactId: calls.campaignContactId })
    .from(calls).where(eq(calls.id, callId)).limit(1);
  if (!callRow?.campaignContactId) return;

  const [contactRow] = await db.select({ id: campaignContacts.id, campaignId: campaignContacts.campaignId })
    .from(campaignContacts).where(eq(campaignContacts.id, callRow.campaignContactId)).limit(1);
  if (!contactRow) return;

  const isVoicemail = answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence';
  const isNoAnswer = twilioStatus === 'no-answer' || twilioStatus === 'busy';
  const isFailed = twilioStatus === 'failed';

  let contactStatus: 'ANSWERED' | 'VOICEMAIL' | 'NO_ANSWER' | 'FAILED' = 'ANSWERED';
  if (isVoicemail) contactStatus = 'VOICEMAIL';
  else if (isNoAnswer) contactStatus = 'NO_ANSWER';
  else if (isFailed) contactStatus = 'FAILED';

  await db.update(campaignContacts).set({ status: contactStatus })
    .where(eq(campaignContacts.id, contactRow.id));

  if (contactStatus === 'ANSWERED') {
    await db.update(campaigns).set({ answeredCount: sql`${campaigns.answeredCount} + 1`, updatedAt: new Date() })
      .where(eq(campaigns.id, contactRow.campaignId));
  } else if (contactStatus === 'VOICEMAIL') {
    await db.update(campaigns).set({ voicemailCount: sql`${campaigns.voicemailCount} + 1`, updatedAt: new Date() })
      .where(eq(campaigns.id, contactRow.campaignId));
  }
}
