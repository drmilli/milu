import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, campaigns, campaignContacts, businesses, phoneNumbers, payments, contacts } from '../db';
import { authMiddleware } from '../middleware/auth';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { startCampaign } from '../services/campaign-dialer';

export const campaignsRouter: Router = Router();
campaignsRouter.use(authMiddleware);

const PRICE_PER_CALL = 0.25;
const MIN_CALLS = 4;

async function createWhopCheckout(campaignId: string, businessId: string, amountUsd: number): Promise<string> {
  // Use WHOP_COMPANY_API_KEY (seller key) if set, fall back to WHOP_API_KEY
  const apiKey = env.WHOP_COMPANY_API_KEY ?? env.WHOP_API_KEY;
  if (!apiKey) throw new Error('Whop is not configured — set WHOP_COMPANY_API_KEY in Railway');

  const payload = {
    plan: {
      initial_price: amountUsd,
      billing_period: 0,
    },
    metadata: { campaignId, businessId },
    redirect_url: `${env.APP_URL}/campaigns?paid=${campaignId}`,
    cancel_url: `${env.APP_URL}/campaigns?cancelled=${campaignId}`,
  };

  logger.info({ campaignId, amountUsd, apiKeyPrefix: apiKey.slice(0, 12) }, 'Creating Whop checkout configuration');

  const res = await fetch('https://api.whop.com/v5/checkout-configurations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  logger.info({ status: res.status, body: raw.slice(0, 800), campaignId }, 'Whop checkout-configurations response');

  if (!res.ok) {
    throw new Error(`Whop checkout configuration failed ${res.status}: ${raw}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = JSON.parse(raw) as any;

  // Whop may nest the response under `data` or return fields at the top level
  const inner = data?.data ?? data;
  const checkoutUrl: string | undefined =
    inner?.checkout_url ??
    inner?.url ??
    (inner?.id ? `https://whop.com/checkout/${inner.id}/` : undefined);

  if (!checkoutUrl) {
    logger.error({ raw: raw.slice(0, 800), campaignId }, 'Whop checkout response missing URL — full response logged above');
    throw new Error('Whop did not return a checkout URL. Check Railway logs.');
  }

  logger.info({ checkoutUrl, campaignId }, 'Whop checkout URL ready');
  return checkoutUrl;
}

// ─── POST /campaigns — create campaign + contacts ──────────────────────────────
campaignsRouter.post('/', async (req, res, next) => {
  try {
    const businessId = req.headers['x-business-id'] as string;
    if (!businessId) return res.status(400).json({ error: 'Business ID required' });

    const body = z.object({
      name: z.string().min(1),
      goal: z.string().min(1),
      script: z.string().optional(),
      contacts: z.array(z.object({
        name: z.string().optional(),
        phoneNumber: z.string().min(5),
      })).min(1),
    }).parse(req.body);

    const billedCount = Math.max(body.contacts.length, MIN_CALLS);
    const totalCost = (billedCount * PRICE_PER_CALL).toFixed(2);

    const [campaign] = await db.insert(campaigns).values({
      businessId,
      name: body.name,
      goal: body.goal,
      script: body.script,
      status: 'PENDING_PAYMENT',
      contactCount: body.contacts.length,
      totalCost,
    }).returning();

    if (!campaign) return res.status(500).json({ error: 'Failed to create campaign' });

    await db.insert(campaignContacts).values(
      body.contacts.map(c => ({
        campaignId: campaign.id,
        name: c.name,
        phoneNumber: c.phoneNumber,
      }))
    );

    return res.status(201).json({ campaign });
  } catch (err) { next(err); }
});

// ─── GET /campaigns — list campaigns for business ─────────────────────────────
campaignsRouter.get('/', async (req, res, next) => {
  try {
    const businessId = req.headers['x-business-id'] as string;
    if (!businessId) return res.status(400).json({ error: 'Business ID required' });

    const rows = await db.select().from(campaigns)
      .where(eq(campaigns.businessId, businessId))
      .orderBy(desc(campaigns.createdAt));

    return res.json({ campaigns: rows });
  } catch (err) { next(err); }
});

// ─── GET /campaigns/:id — get campaign with contacts ──────────────────────────
campaignsRouter.get('/:id', async (req, res, next) => {
  try {
    const businessId = req.headers['x-business-id'] as string;
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, req.params.id), eq(campaigns.businessId, businessId)))
      .limit(1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const contacts = await db.select().from(campaignContacts)
      .where(eq(campaignContacts.campaignId, campaign.id))
      .orderBy(campaignContacts.createdAt);

    return res.json({ campaign, contacts });
  } catch (err) { next(err); }
});

// ─── POST /campaigns/:id/checkout — create Whop checkout ──────────────────────
campaignsRouter.post('/:id/checkout', async (req, res, next) => {
  try {
    const businessId = req.headers['x-business-id'] as string;
    const [campaign] = await db.select().from(campaigns)
      .where(and(eq(campaigns.id, req.params.id), eq(campaigns.businessId, businessId)))
      .limit(1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'PENDING_PAYMENT') return res.status(400).json({ error: 'Campaign is not awaiting payment' });

    const amountUsd = parseFloat(campaign.totalCost);
    const checkoutUrl = await createWhopCheckout(campaign.id, businessId, amountUsd);

    // Store the checkout URL so we can resume if user returns
    await db.update(campaigns).set({ stripeCheckoutSessionId: checkoutUrl, updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));

    return res.json({ url: checkoutUrl });
  } catch (err) { next(err); }
});

// ─── GET /campaigns/contacts — existing business contacts for picker ──────────
campaignsRouter.get('/contacts/list', async (req, res, next) => {
  try {
    const businessId = req.headers['x-business-id'] as string;
    if (!businessId) return res.status(400).json({ error: 'Business ID required' });

    const rows = await db.select({ id: contacts.id, name: contacts.name, phone: contacts.phone })
      .from(contacts)
      .where(eq(contacts.businessId, businessId))
      .orderBy(contacts.name)
      .limit(500);

    return res.json({ contacts: rows });
  } catch (err) { next(err); }
});

// ─── DELETE /campaigns/:id — cancel campaign ──────────────────────────────────
campaignsRouter.delete('/:id', async (req, res, next) => {
  try {
    const businessId = req.headers['x-business-id'] as string;
    const [campaign] = await db.select({ id: campaigns.id, status: campaigns.status })
      .from(campaigns)
      .where(and(eq(campaigns.id, req.params.id), eq(campaigns.businessId, businessId)))
      .limit(1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'RUNNING') return res.status(400).json({ error: 'Cannot delete a running campaign' });

    await db.update(campaigns).set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));

    return res.status(204).send();
  } catch (err) { next(err); }
});

// ─── activateCampaignPayment — called by Whop webhook ─────────────────────────
export async function activateCampaignPayment(campaignId: string) {
  const [campaign] = await db.update(campaigns)
    .set({ status: 'RUNNING', paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'PENDING_PAYMENT')))
    .returning();

  if (!campaign) return;

  logger.info({ campaignId, businessId: campaign.businessId }, 'Campaign paid via Whop — starting dialer');

  // Log to payment history
  await db.insert(payments).values({
    businessId: campaign.businessId,
    campaignId: campaign.id,
    type: 'CAMPAIGN',
    description: `Outbound campaign: ${campaign.name}`,
    amountUsd: parseFloat(campaign.totalCost),
    whopRef: campaignId,
  }).catch(() => null);

  const [phoneRow] = await db.select({ number: phoneNumbers.number })
    .from(phoneNumbers)
    .where(eq(phoneNumbers.businessId, campaign.businessId))
    .limit(1);

  startCampaign(campaign.id, campaign.businessId, phoneRow?.number ?? null).catch(err =>
    logger.error({ err, campaignId }, 'Campaign dialer error')
  );
}
