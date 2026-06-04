import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { and, eq, sql, gte } from 'drizzle-orm';
import { db, businesses, users, calls, affiliateAgents, affiliateCommissions, affiliateReferrals, affiliateSettings, payments } from '../db';
import { authMiddleware } from '../middleware/auth';
import { env } from '../config/env';
import { sendSubscriptionConfirmEmail, sendSubscriptionCancelledEmail } from '../utils/email';
import { logger } from '../config/logger';
import { sendNotification } from '../services/notifications';
import { activateCampaignPayment } from './campaigns';

export const billingRouter: Router = Router();

const WHOP_API_BASE = 'https://api.whop.com/api/v2';

const PLAN_MAP: Record<string, 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'ONE_TIME'> = {
  plan_wvq0cvpguvcnm: 'ONE_TIME',
  plan_np7nmd2igcr6r: 'STARTER',
  plan_2kpowliqeudfl: 'GROWTH',
};

const ADD_ON_PLAN_IDS = new Set([
  'plan_hiqfgc9kkjemx', // additional phone number ($3)
]);

async function whopRequest<T = Record<string, unknown>>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${WHOP_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.WHOP_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whop API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/**
 * @openapi
 * tags:
 *   - name: Billing
 *     description: Subscription and payment management via Whop
 */

/**
 * @openapi
 * /api/v1/billing/plans:
 *   get:
 *     tags: [Billing]
 *     summary: List available subscription plans from Whop
 *     responses:
 *       200:
 *         description: Available plans
 */
billingRouter.get('/plans', async (_req, res, next) => {
  try {
    if (!env.WHOP_API_KEY || !env.WHOP_COMPANY_ID) {
      return res.json({
        plans: [
          { id: 'one_time', name: 'One-time', price: 20, currency: 'USD', features: ['Voice AI agent', 'Call logs', 'Email notifications'] },
          { id: 'starter', name: 'Starter', price: 25, currency: 'USD', features: ['200 calls/mo', '1 phone number', 'Basic analytics', 'Email notifications'] },
          { id: 'growth', name: 'Growth', price: 45, currency: 'USD', features: ['500 calls/mo', 'Full analytics', 'Team members', 'WhatsApp notifications', 'Bulk WhatsApp broadcasts'] },
          { id: 'enterprise', name: 'Enterprise', price: 0, currency: 'USD', features: ['Unlimited calls', 'CRM & contacts', 'Sales follow-ups', 'Multiple businesses', 'Priority support', 'Custom pricing'] },
        ],
      });
    }

    const data = await whopRequest(`/companies/${env.WHOP_COMPANY_ID}/plans`);
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/billing/checkout:
 *   post:
 *     tags: [Billing]
 *     summary: Create a Whop checkout URL for a plan
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId, businessId]
 *             properties:
 *               planId: { type: string, description: "Whop plan/product ID" }
 *               businessId: { type: string }
 *     responses:
 *       200:
 *         description: Checkout URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 checkoutUrl: { type: string }
 */
billingRouter.post('/checkout', authMiddleware, async (req, res, next) => {
  try {
    const { planId, businessId } = z.object({
      planId: z.string(),
      businessId: z.string(),
    }).parse(req.body);

    if (!env.WHOP_API_KEY) {
      return res.json({ checkoutUrl: `${env.APP_URL}/pricing?plan=${planId}&demo=1` });
    }

    const data = await whopRequest<{ checkout_url?: string; url?: string }>('/checkout/links', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        metadata: { businessId, userId: req.user?.userId },
        redirect_url: `${env.APP_URL}/dashboard/billing?success=1`,
        cancel_url: `${env.APP_URL}/pricing`,
      }),
    });

    return res.json({ checkoutUrl: data.checkout_url ?? data.url });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/billing/subscription/{businessId}:
 *   get:
 *     tags: [Billing]
 *     summary: Get current subscription for a business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Subscription details
 */
const TIER_META: Record<string, { planId: string; planName: string; priceUsd: number; callLimit: number | null; memberLimit: number | null }> = {
  ONE_TIME:   { planId: 'one_time',   planName: 'One-time',   priceUsd: 20, callLimit: 200,  memberLimit: 1    },
  STARTER:    { planId: 'starter',    planName: 'Starter',    priceUsd: 25, callLimit: 200,  memberLimit: 2    },
  GROWTH:     { planId: 'growth',     planName: 'Growth',     priceUsd: 45, callLimit: 500,  memberLimit: null },
  ENTERPRISE: { planId: 'enterprise', planName: 'Enterprise', priceUsd: 0,  callLimit: null, memberLimit: null },
};

function trialEndsAt(createdAt: Date) {
  return new Date(createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);
}

billingRouter.get('/subscription/:businessId', authMiddleware, async (req, res, next) => {
  try {
    const [biz] = await db
      .select({ subscriptionTier: businesses.subscriptionTier, isActive: businesses.isActive, createdAt: businesses.createdAt })
      .from(businesses)
      .where(eq(businesses.id, req.params.businessId))
      .limit(1);

    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const tier = biz.subscriptionTier ?? 'STARTER';
    const meta = TIER_META[tier] ?? TIER_META['STARTER'];

    // Count calls this month
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const [callCount, memberCount] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(calls)
        .where(and(eq(calls.businessId, req.params.businessId), gte(calls.startedAt, startOfMonth))),
      db.select({ n: sql<number>`count(*)` }).from(users)
        .where(eq(users.businessId, req.params.businessId)),
    ]);

    const now = new Date();
    const isTrial = tier === 'STARTER' && now < trialEndsAt(biz.createdAt);
    const effectiveMeta = isTrial ? TIER_META['GROWTH'] : meta;

    // Renewal date = end of trial (trialing), else same day next month
    const renewsAt = isTrial
      ? trialEndsAt(biz.createdAt)
      : tier === 'ONE_TIME'
        ? new Date(biz.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
        : new Date(biz.createdAt);
    if (!isTrial && tier !== 'ONE_TIME') {
      while (renewsAt <= now) renewsAt.setMonth(renewsAt.getMonth() + 1);
    }

    const effectiveTier = isTrial ? 'GROWTH' : tier;
    const features = {
      broadcasts: effectiveTier === 'GROWTH' || effectiveTier === 'ENTERPRISE',
      crm: effectiveTier === 'ENTERPRISE',
      multiBusiness: effectiveTier === 'ENTERPRISE',
    };

    return res.json({
      planId: effectiveMeta.planId,
      planName: isTrial ? 'Free Trial (All features)' : effectiveMeta.planName,
      status: biz.isActive ? (isTrial ? 'trialing' : 'active') : 'cancelled',
      price: isTrial ? 0 : effectiveMeta.priceUsd,
      currency: 'USD',
      renewsAt: renewsAt.toISOString(),
      usage: {
        calls: { used: Number(callCount[0]?.n ?? 0), limit: effectiveMeta.callLimit },
        teamMembers: { used: Number(memberCount[0]?.n ?? 0), limit: effectiveMeta.memberLimit },
      },
      features,
    });
  } catch (err) {
    next(err);
  }
});

billingRouter.get('/invoices/:businessId', authMiddleware, async (req, res, next) => {
  try {
    // If Whop API key available, try fetching real invoices
    if (env.WHOP_API_KEY) {
      try {
        const data = await whopRequest<{ data?: unknown[] }>(`/memberships?metadata[businessId]=${req.params.businessId}`);
        return res.json(data?.data ?? []);
      } catch {
        // fall through to empty
      }
    }
    // Return empty — invoices managed on Whop's side
    return res.json([]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/billing/portal:
 *   post:
 *     tags: [Billing]
 *     summary: Get Whop customer portal URL to manage subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessId]
 *             properties:
 *               businessId: { type: string }
 *     responses:
 *       200:
 *         description: Portal URL
 */
billingRouter.post('/portal', authMiddleware, async (req, res, next) => {
  try {
    const { businessId } = z.object({ businessId: z.string() }).parse(req.body);

    if (!env.WHOP_API_KEY) {
      return res.json({ portalUrl: `https://whop.com/hub` });
    }

    const memberships = await whopRequest<{ data?: { id: string }[] }>(`/memberships?metadata[businessId]=${businessId}&status=active`);
    const membership = memberships?.data?.[0];
    if (!membership) return res.status(404).json({ error: 'No active subscription found' });

    return res.json({ portalUrl: `https://whop.com/hub/${membership.id}` });
  } catch (err) {
    next(err);
  }
});

// ─── Webhook (no auth — verified by signature) ───────────────────────────────

/**
 * @openapi
 * /webhooks/whop:
 *   post:
 *     tags: [Billing]
 *     summary: Whop webhook receiver
 *     description: Handles payment.completed, membership.went_valid, membership.went_invalid events
 *     responses:
 *       200:
 *         description: Acknowledged
 */
export async function handleWhopWebhook(req: import('express').Request, res: import('express').Response) {
  const sig = req.headers['whop-signature'] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (env.WHOP_WEBHOOK_SECRET && sig && rawBody) {
    const expected = crypto
      .createHmac('sha256', env.WHOP_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    if (sig !== expected) {
      logger.warn('Invalid Whop webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const event = req.body as { action: string; data: Record<string, unknown> };
  logger.info({ action: event.action }, 'Whop webhook received');

  try {
    switch (event.action) {
      case 'membership.went_valid':
      case 'payment.completed': {
        const meta = (event.data.metadata ?? {}) as Record<string, string>;

        // Campaign one-time payment — activate and start dialer
        if (meta.campaignId) {
          await activateCampaignPayment(meta.campaignId).catch(err =>
            logger.error({ err, campaignId: meta.campaignId }, 'Failed to activate campaign after Whop payment')
          );
          break;
        }

        const businessId = meta.businessId;
        const planId = (event.data.plan_id ?? event.data.product_id ?? '') as string;
        const planKey = planId.toLowerCase();
        if (ADD_ON_PLAN_IDS.has(planKey)) break;
        const tier = PLAN_MAP[planKey];
        if (!tier) {
          logger.warn({ planId, businessId, action: event.action }, 'Whop webhook: unknown plan id (ignored)');
          break;
        }

        if (businessId) {
          await db.update(businesses)
            .set({ subscriptionTier: tier, isActive: true, trialEndedAt: null, updatedAt: new Date() })
            .where(eq(businesses.id, businessId));

          const owner = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.businessId, businessId))
            .limit(1);

          const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
          if (owner[0] && biz) {
            await sendSubscriptionConfirmEmail(owner[0].email, tier, biz.name);
          }

          if (event.action === 'payment.completed') {
            const paymentRef = String(
              (event.data as any).id ??
              (event.data as any).payment_id ??
              (event.data as any).transaction_id ??
              (event.data as any).membership_id ??
              (rawBody ? crypto.createHash('sha256').update(rawBody).digest('hex') : `${Date.now()}`),
            );

            // Log payment to history
            const planPrices: Record<string, number> = { STARTER: 25, GROWTH: 45, ENTERPRISE: 0, ONE_TIME: 0 };
            const amountFromEvent = Number((event.data as any).amount ?? (event.data as any).amount_usd ?? 0);
            await db.insert(payments).values({
              businessId,
              type: 'SUBSCRIPTION',
              plan: tier,
              description: `${tier.charAt(0) + tier.slice(1).toLowerCase()} plan subscription`,
              amountUsd: amountFromEvent || planPrices[tier] || 0,
              whopRef: paymentRef,
            }).onConflictDoNothing().catch(() => null);

            const [bizRow] = await db.select({
              affiliateAgentId: businesses.affiliateAgentId,
            }).from(businesses).where(eq(businesses.id, businessId)).limit(1);

            const agentId = bizRow?.affiliateAgentId ?? null;
            if (agentId) {
              const [ref] = await db.select({
                id: affiliateReferrals.id,
                eligibilityEndsAt: affiliateReferrals.eligibilityEndsAt,
              }).from(affiliateReferrals).where(eq(affiliateReferrals.businessId, businessId)).limit(1);

              if (ref && ref.eligibilityEndsAt > new Date()) {
                const [agent] = await db.select({
                  id: affiliateAgents.id,
                  name: affiliateAgents.name,
                  email: affiliateAgents.email,
                  status: affiliateAgents.status,
                  commissionPercent: affiliateAgents.commissionPercent,
                }).from(affiliateAgents).where(eq(affiliateAgents.id, agentId)).limit(1);

                if (agent && agent.status !== 'BANNED') {
                  const [settings] = await db.select({
                    defaultCommissionPercent: affiliateSettings.defaultCommissionPercent,
                  }).from(affiliateSettings).limit(1);

                  const percent = agent.commissionPercent ?? settings?.defaultCommissionPercent ?? 15;

                  const metaAmount = (event.data as any).amount_usd ?? (event.data as any).amountUsd ?? (event.data as any).amount ?? (event.data as any).total;
                  const parsed = typeof metaAmount === 'number'
                    ? metaAmount
                    : typeof metaAmount === 'string'
                      ? Number(metaAmount)
                      : NaN;
                  const amountPaidUsd = Number.isFinite(parsed) && parsed > 0
                    ? Math.round(parsed)
                    : (TIER_META[tier]?.priceUsd ?? 0);

                  const commissionAmountUsd = Math.max(0, Math.round((amountPaidUsd * percent) / 100));
                  const status = agent.status === 'SUSPENDED' ? 'LOCKED' : 'CONFIRMED';

                  const existing = await db.select({ id: affiliateCommissions.id })
                    .from(affiliateCommissions)
                    .where(and(eq(affiliateCommissions.affiliateAgentId, agent.id), eq(affiliateCommissions.paymentRef, paymentRef)))
                    .limit(1);

                  if (!existing.length && amountPaidUsd > 0 && commissionAmountUsd > 0) {
                    await db.insert(affiliateCommissions).values({
                      affiliateAgentId: agent.id,
                      businessId,
                      paymentRef,
                      amountPaidUsd,
                      commissionPercent: percent,
                      commissionAmountUsd,
                      status,
                    });

                    if (status === 'CONFIRMED') {
                      sendNotification({
                        title: 'Commission earned',
                        body: `Hi ${agent.name},\n\nYou earned a $${commissionAmountUsd} commission from a referred business payment.\n\nPayment: $${amountPaidUsd}\nCommission rate: ${percent}%`,
                        channel: 'EMAIL',
                        recipient: agent.email,
                        data: { affiliateAgentId: agent.id, businessId, paymentRef },
                      }).catch(() => null);
                    }
                  }
                }
              }
            }
          }
        }
        break;
      }

      case 'membership.went_invalid':
      case 'membership.cancelled': {
        const meta = (event.data.metadata ?? {}) as Record<string, string>;
        const businessId = meta.businessId;

        if (businessId) {
          await db.update(businesses)
            .set({ subscriptionTier: 'STARTER', updatedAt: new Date() })
            .where(eq(businesses.id, businessId));

          const owner = await db.select({ email: users.email }).from(users).where(eq(users.businessId, businessId)).limit(1);
          const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
          if (owner[0] && biz) {
            await sendSubscriptionCancelledEmail(owner[0].email, biz.name);
          }
        }
        break;
      }

      default:
        logger.debug({ action: event.action }, 'Unhandled Whop event');
    }
  } catch (err) {
    logger.error(err, 'Error processing Whop webhook');
  }

  return res.json({ received: true });
}
