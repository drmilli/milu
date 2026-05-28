import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
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
  const apiKey = env.WHOP_COMPANY_API_KEY ?? env.WHOP_API_KEY;
  if (!apiKey) throw new Error('Whop is not configured');
  if (!env.WHOP_COMPANY_ID) throw new Error('WHOP_COMPANY_ID is not set');

  // Whop API v1 — checkout_configurations
  // Docs: https://docs.whop.com/api-reference/checkout-configurations/create-checkout-configuration
  const payload = {
    mode: 'payment',
    plan: {
      company_id: env.WHOP_COMPANY_ID,
      currency: 'usd',
      plan_type: 'one_time',
      adaptive_pricing_enabled: false,
      initial_price: amountUsd,
      title: `Outbound Campaign (${campaignId.slice(0, 8)})`,
      product: {
        external_identifier: `milu-campaign-${campaignId}`,
        title: 'Milu Outbound Campaign',
        visibility: 'hidden',
      },
    },
    metadata: { campaignId, businessId },
    redirect_url: `${env.APP_URL}/campaigns?paid=${campaignId}`,
  };

  logger.info({ campaignId, amountUsd, apiKeyPrefix: apiKey.slice(0, 10) }, 'Creating Whop checkout configuration');

  const res = await fetch('https://api.whop.com/api/v1/checkout_configurations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  logger.info({ status: res.status, body: raw.slice(0, 800), campaignId }, 'Whop checkout_configurations response');

  if (!res.ok) {
    throw new Error(`Whop checkout configuration failed ${res.status}: ${raw}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = JSON.parse(raw) as any;
  const id: string | undefined = data?.id ?? data?.data?.id;

  if (!id) {
    logger.error({ raw: raw.slice(0, 800), campaignId }, 'Whop checkout response missing id');
    throw new Error('Whop did not return a checkout configuration ID. Check Railway logs.');
  }

  const checkoutUrl = `https://whop.com/checkout/${id}/`;
  logger.info({ checkoutUrl, id, campaignId }, 'Whop checkout URL ready');
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
      scheduledAt: z.string().datetime().optional(),
      contacts: z.array(z.object({
        name: z.string().optional(),
        phoneNumber: z.string().min(5),
      })).min(1),
    }).parse(req.body);

    const billedCount = Math.max(body.contacts.length, MIN_CALLS);
    const totalCost = (billedCount * PRICE_PER_CALL).toFixed(2);
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    const [campaign] = await db.insert(campaigns).values({
      businessId,
      name: body.name,
      goal: body.goal,
      script: body.script,
      scheduledAt,
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
  const now = new Date();
  const [existing] = await db.select().from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'PENDING_PAYMENT')))
    .limit(1);
  if (!existing) return;

  const isScheduled = existing.scheduledAt && existing.scheduledAt > now;
  const newStatus = isScheduled ? 'SCHEDULED' : 'RUNNING';

  const [campaign] = await db.update(campaigns)
    .set({ status: newStatus, paidAt: now, updatedAt: now })
    .where(eq(campaigns.id, campaignId))
    .returning();

  if (!campaign) return;

  logger.info({ campaignId, businessId: campaign.businessId, status: newStatus, scheduledAt: campaign.scheduledAt }, 'Campaign paid via Whop');

  // Log to payment history
  await db.insert(payments).values({
    businessId: campaign.businessId,
    campaignId: campaign.id,
    type: 'CAMPAIGN',
    description: `Outbound campaign: ${campaign.name}`,
    amountUsd: parseFloat(campaign.totalCost),
    whopRef: campaignId,
  }).catch(() => null);

  if (newStatus === 'RUNNING') {
    const [phoneRow] = await db.select({ number: phoneNumbers.number })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.businessId, campaign.businessId))
      .limit(1);

    startCampaign(campaign.id, campaign.businessId, phoneRow?.number ?? null).catch(err =>
      logger.error({ err, campaignId }, 'Campaign dialer error')
    );
  }
}

// ─── runScheduledCampaigns — called every minute from index.ts ─────────────────
export async function runScheduledCampaigns() {
  const due = await db.select().from(campaigns)
    .where(and(
      eq(campaigns.status, 'SCHEDULED'),
      sql`${campaigns.scheduledAt} <= now()`
    ));

  for (const campaign of due) {
    logger.info({ campaignId: campaign.id }, 'Scheduled campaign is due — starting dialer');
    await db.update(campaigns).set({ status: 'RUNNING', updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));

    const [phoneRow] = await db.select({ number: phoneNumbers.number })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.businessId, campaign.businessId))
      .limit(1);

    startCampaign(campaign.id, campaign.businessId, phoneRow?.number ?? null).catch(err =>
      logger.error({ err, campaignId: campaign.id }, 'Scheduled campaign dialer error')
    );
  }
}
