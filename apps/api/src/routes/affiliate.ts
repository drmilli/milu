import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, affiliateAgents, affiliateCommissions, affiliateReferrals, affiliateSettings, affiliateWithdrawalRequests, businesses } from '../db';
import { authLimiter } from '../middleware/rate-limit';
import { signAffiliateToken, verifyAffiliateToken, type JwtPayload } from '../utils/jwt';
import { sendNotification } from '../services/notifications';

function affiliateAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization token' });
  try {
    const payload = verifyAffiliateToken(header.slice(7));
    if (payload.role !== 'AFFILIATE') return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function ensureAffiliateSettings() {
  const [row] = await db.select().from(affiliateSettings).limit(1);
  if (row) return row;
  const [created] = await db.insert(affiliateSettings).values({}).returning();
  return created!;
}

async function generateReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const candidate = `AGT_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const existing = await db.select({ id: affiliateAgents.id }).from(affiliateAgents).where(eq(affiliateAgents.referralCode, candidate)).limit(1);
    if (!existing.length) return candidate;
  }
  return `AGT_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

export const affiliateAuthRouter: Router = Router();

affiliateAuthRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().min(2).max(140),
      email: z.string().email().max(200),
      password: z.string().min(8).max(200),
    }).parse(req.body);

    const existing = await db.select({ id: affiliateAgents.id }).from(affiliateAgents).where(eq(affiliateAgents.email, data.email)).limit(1);
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    await ensureAffiliateSettings();

    const hashed = await bcrypt.hash(data.password, 10);
    const referralCode = await generateReferralCode();

    const [agent] = await db.insert(affiliateAgents).values({
      name: data.name,
      email: data.email,
      password: hashed,
      referralCode,
      status: 'ACTIVE',
    }).returning({ id: affiliateAgents.id, name: affiliateAgents.name, email: affiliateAgents.email, referralCode: affiliateAgents.referralCode, status: affiliateAgents.status });

    sendNotification({
      title: 'Welcome to Milu Affiliate',
      body: `Hi ${agent.name},\n\nYour affiliate account has been created.\n\nYour referral code: ${agent.referralCode}`,
      channel: 'EMAIL',
      recipient: agent.email,
      data: { affiliateAgentId: agent.id },
    }).catch(() => null);

    const token = signAffiliateToken({ userId: agent.id, role: 'AFFILIATE' } satisfies JwtPayload);
    return res.status(201).json({ token, agent });
  } catch (err) {
    next(err);
  }
});

affiliateAuthRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const [agent] = await db.select().from(affiliateAgents).where(eq(affiliateAgents.email, email)).limit(1);
    if (!agent || !(await bcrypt.compare(password, agent.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (agent.status !== 'ACTIVE') return res.status(403).json({ error: 'Account is not active' });

    const token = signAffiliateToken({ userId: agent.id, role: 'AFFILIATE' } satisfies JwtPayload);
    return res.json({
      token,
      agent: { id: agent.id, name: agent.name, email: agent.email, referralCode: agent.referralCode, status: agent.status },
    });
  } catch (err) { next(err); }
});

affiliateAuthRouter.get('/me', affiliateAuthMiddleware, async (req, res, next) => {
  try {
    const agentId = req.user!.userId;
    const [agent] = await db.select({
      id: affiliateAgents.id,
      name: affiliateAgents.name,
      email: affiliateAgents.email,
      referralCode: affiliateAgents.referralCode,
      status: affiliateAgents.status,
      commissionPercent: affiliateAgents.commissionPercent,
      commissionMonths: affiliateAgents.commissionMonths,
      createdAt: affiliateAgents.createdAt,
    }).from(affiliateAgents).where(eq(affiliateAgents.id, agentId)).limit(1);

    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    return res.json(agent);
  } catch (err) { next(err); }
});

export const affiliateRouter: Router = Router();
affiliateRouter.use(affiliateAuthMiddleware);

affiliateRouter.get('/dashboard', async (req, res, next) => {
  try {
    const agentId = req.user!.userId;
    const [agent] = await db.select({
      id: affiliateAgents.id,
      referralCode: affiliateAgents.referralCode,
      status: affiliateAgents.status,
    }).from(affiliateAgents).where(eq(affiliateAgents.id, agentId)).limit(1);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const settings = await ensureAffiliateSettings();
    const commissionPercent = agent.status === 'ACTIVE'
      ? (await db.select({ v: affiliateAgents.commissionPercent }).from(affiliateAgents).where(eq(affiliateAgents.id, agentId)).limit(1))[0]?.v ?? settings.defaultCommissionPercent
      : settings.defaultCommissionPercent;

    const [refCount, commissionSum, pendingWithdrawals, paidWithdrawals] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(affiliateReferrals).where(eq(affiliateReferrals.affiliateAgentId, agentId)),
      db.select({ n: sql<number>`coalesce(sum(${affiliateCommissions.commissionAmountUsd}), 0)` })
        .from(affiliateCommissions)
        .where(and(eq(affiliateCommissions.affiliateAgentId, agentId), eq(affiliateCommissions.status, 'CONFIRMED'))),
      db.select({ n: sql<number>`coalesce(sum(${affiliateWithdrawalRequests.amountUsd}), 0)` })
        .from(affiliateWithdrawalRequests)
        .where(and(eq(affiliateWithdrawalRequests.affiliateAgentId, agentId), eq(affiliateWithdrawalRequests.status, 'NEW'))),
      db.select({ n: sql<number>`coalesce(sum(${affiliateWithdrawalRequests.amountUsd}), 0)` })
        .from(affiliateWithdrawalRequests)
        .where(and(eq(affiliateWithdrawalRequests.affiliateAgentId, agentId), eq(affiliateWithdrawalRequests.status, 'PAID'))),
    ]);

    const referralLink = `https://dashboard.miluai.app/register?ref=${encodeURIComponent(agent.referralCode)}`;

    return res.json({
      referralCode: agent.referralCode,
      referralLink,
      commissionPercent,
      stats: {
        referrals: Number(refCount[0]?.n ?? 0),
        totalEarnedUsd: Number(commissionSum[0]?.n ?? 0),
        pendingWithdrawalsUsd: Number(pendingWithdrawals[0]?.n ?? 0),
        paidWithdrawalsUsd: Number(paidWithdrawals[0]?.n ?? 0),
      },
    });
  } catch (err) { next(err); }
});

affiliateRouter.get('/referrals', async (req, res, next) => {
  try {
    const agentId = req.user!.userId;
    const rows = await db.select({
      id: affiliateReferrals.id,
      businessId: affiliateReferrals.businessId,
      businessName: businesses.name,
      referredAt: affiliateReferrals.referredAt,
      eligibilityEndsAt: affiliateReferrals.eligibilityEndsAt,
      plan: businesses.subscriptionTier,
      isActive: businesses.isActive,
    })
      .from(affiliateReferrals)
      .leftJoin(businesses, eq(businesses.id, affiliateReferrals.businessId))
      .where(eq(affiliateReferrals.affiliateAgentId, agentId))
      .orderBy(desc(affiliateReferrals.referredAt));

    return res.json(rows.map(r => ({
      id: r.id,
      businessId: r.businessId,
      businessName: r.businessName ?? '—',
      referredAt: r.referredAt.toISOString(),
      eligibilityEndsAt: r.eligibilityEndsAt.toISOString(),
      plan: r.plan,
      status: r.isActive ? 'active' : 'inactive',
    })));
  } catch (err) { next(err); }
});

affiliateRouter.get('/withdrawals', async (req, res, next) => {
  try {
    const agentId = req.user!.userId;
    const rows = await db.select().from(affiliateWithdrawalRequests)
      .where(eq(affiliateWithdrawalRequests.affiliateAgentId, agentId))
      .orderBy(desc(affiliateWithdrawalRequests.createdAt));

    return res.json(rows.map(r => ({
      id: r.id,
      amountUsd: r.amountUsd,
      status: r.status,
      adminNote: r.adminNote ?? null,
      payoutReference: r.payoutReference ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })));
  } catch (err) { next(err); }
});

affiliateRouter.post('/withdrawals', async (req, res, next) => {
  try {
    const agentId = req.user!.userId;
    const data = z.object({
      amountUsd: z.number().int().positive(),
      bankDetails: z.record(z.unknown()),
    }).parse(req.body);

    const [agent] = await db.select({ status: affiliateAgents.status, email: affiliateAgents.email, name: affiliateAgents.name })
      .from(affiliateAgents).where(eq(affiliateAgents.id, agentId)).limit(1);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (agent.status !== 'ACTIVE') return res.status(403).json({ error: 'Account is not active' });

    const confirmed = await db.select({
      n: sql<number>`coalesce(sum(${affiliateCommissions.commissionAmountUsd}), 0)`,
    }).from(affiliateCommissions).where(and(eq(affiliateCommissions.affiliateAgentId, agentId), eq(affiliateCommissions.status, 'CONFIRMED')));

    const alreadyRequested = await db.select({
      n: sql<number>`coalesce(sum(${affiliateWithdrawalRequests.amountUsd}), 0)`,
    }).from(affiliateWithdrawalRequests).where(and(eq(affiliateWithdrawalRequests.affiliateAgentId, agentId), sql`${affiliateWithdrawalRequests.status} in ('NEW','APPROVED','PAID')`));

    const available = Number(confirmed[0]?.n ?? 0) - Number(alreadyRequested[0]?.n ?? 0);
    if (data.amountUsd > available) return res.status(400).json({ error: 'Insufficient available balance' });

    const [row] = await db.insert(affiliateWithdrawalRequests).values({
      affiliateAgentId: agentId,
      amountUsd: data.amountUsd,
      bankDetails: data.bankDetails,
      status: 'NEW',
      updatedAt: new Date(),
    }).returning();

    sendNotification({
      title: 'Withdrawal request received',
      body: `Hi ${agent.name},\n\nWe received your withdrawal request of $${data.amountUsd}. We will review it shortly.`,
      channel: 'EMAIL',
      recipient: agent.email,
      data: { affiliateAgentId: agentId, withdrawalRequestId: row.id },
    }).catch(() => null);

    return res.status(201).json({ id: row.id });
  } catch (err) { next(err); }
});

