import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db, campaigns, campaignContacts, businesses, phoneNumbers, payments } from '../db';
import { authMiddleware } from '../middleware/auth';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { startCampaign } from '../services/campaign-dialer';

export const campaignsRouter: Router = Router();
campaignsRouter.use(authMiddleware);

const PRICE_PER_CALL = 0.25;
const MIN_CALLS = 4;
const WHOP_API_BASE = 'https://api.whop.com/api/v2';

async function createWhopCheckout(campaignId: string, businessId: string, amountUsd: number): Promise<string> {
  if (!env.WHOP_API_KEY) throw new Error('Whop is not configured');

  const res = await fetch(`${WHOP_API_BASE}/checkout-configurations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHOP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan: {
        initial_price: amountUsd,
        billing_period: 0,
      },
      metadata: { campaignId, businessId },
      redirect_url: `${env.APP_URL}/campaigns?paid=${campaignId}`,
      cancel_url: `${env.APP_URL}/campaigns?cancelled=${campaignId}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whop checkout configuration failed ${res.status}: ${body}`);
  }

  const data = await res.json() as { id: string; checkout_url?: string };
  return data.checkout_url ?? `https://whop.com/checkout/${data.id}/`;
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
