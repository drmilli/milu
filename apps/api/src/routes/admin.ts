import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { eq, desc, ilike, and, or, sql, gte, inArray, lt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import twilio from 'twilio';
import { db, businesses, users, calls, escalations, phoneNumbers, agentConfigs, notifications, catalogItems, contactSubmissions, phoneNumberRequests, dataConnectors } from '../db';
import { logger } from '../config/logger';
import { adminGuard } from '../middleware/admin-guard';
import { signAdminToken, verifyAdminToken } from '../utils/jwt';
import { authLimiter } from '../middleware/rate-limit';
import { env } from '../config/env';
import { sendTestEmail, sendVerificationEmail, sendPasswordResetEmail, sendTeamInviteEmail, sendSubscriptionConfirmEmail, sendSubscriptionCancelledEmail, sendPhoneNumberAssignedEmail } from '../utils/email';
import { sendEscalationAlert, sendOrderConfirmation, sendAppointmentReminder, sendCallbackRequest, sendMissedCallAlert, sendWeeklySummary, sendWhatsAppText } from '../services/whatsapp';

function isMissingDbObject(err: unknown) {
  const code = (err as any)?.code as string | undefined;
  return code === '42P01' || code === '42704';
}

function getTwilioClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

async function notifyNumberAssigned(businessId: string, businessName: string, miluNumber: string) {
  try {
    const members = await db.select({ email: users.email, role: users.role }).from(users).where(eq(users.businessId, businessId));
    const emails = Array.from(new Set(members.map(m => m.email).filter(Boolean)));
    if (!emails.length) {
      logger.warn({ businessId, miluNumber }, 'No business users found to email number assignment');
      return;
    }
    await Promise.all(emails.map((email) => sendPhoneNumberAssignedEmail(email, businessName, miluNumber)));
    logger.info({ businessId, miluNumber, emails: emails.length }, 'Phone number assignment email sent');
  } catch (err) {
    logger.error({ err, businessId, miluNumber }, 'Failed to send phone number assignment email');
  }
}

// ─── Admin JWT middleware (uses ADMIN_JWT_SECRET) ─────────────────────────────
function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization token' });
  try {
    req.user = verifyAdminToken(header.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

// ─── Public admin login (no auth required) ───────────────────────────────────
export const adminAuthRouter: Router = Router();

adminAuthRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const [user] = await db
      .select({ id: users.id, email: users.email, password: users.password, firstName: users.firstName, lastName: users.lastName, role: users.role, businessId: users.businessId })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access restricted to Milu admin team.' });
    }

    const token = signAdminToken({ userId: user.id, businessId: user.businessId ?? undefined, role: user.role });
    return res.json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    });
  } catch (err) { next(err); }
});

export const adminRouter: Router = Router();
adminRouter.use(adminAuthMiddleware, adminGuard);

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Internal admin operations (requires admin role)
 */

/**
 * @openapi
 * /api/v1/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Platform-wide stats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Aggregate platform statistics
 */
adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const trialThreshold = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const [
      bizCount, activeBiz, newBizThisMonth,
      callCount, callsThisMonth, callsLastMonth,
      escalationCount, escalationsToday, escalationBizToday,
      planCounts, resolvedCalls, activeCalls,
      activeTrialCount,
    ] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(businesses),
      db.select({ n: sql<number>`count(*)` }).from(businesses).where(eq(businesses.isActive, true)),
      db.select({ n: sql<number>`count(*)` }).from(businesses).where(gte(businesses.createdAt, startOfMonth)),
      db.select({ n: sql<number>`count(*)` }).from(calls),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(gte(calls.startedAt, startOfMonth)),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(and(gte(calls.startedAt, startOfLastMonth), sql`${calls.startedAt} < ${startOfMonth}`)),
      db.select({ n: sql<number>`count(*)` }).from(escalations),
      db.select({ n: sql<number>`count(*)` }).from(escalations).where(gte(escalations.createdAt, startOfToday)),
      db.select({ n: sql<number>`count(distinct ${escalations.businessId})` }).from(escalations).where(gte(escalations.createdAt, startOfToday)),
      db.select({ tier: businesses.subscriptionTier, count: sql<number>`count(*)` }).from(businesses).groupBy(businesses.subscriptionTier),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(eq(calls.resolution, 'AI')),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(eq(calls.status, 'ACTIVE')),
      db.select({ n: sql<number>`count(*)` }).from(businesses)
        .where(and(eq(businesses.subscriptionTier, 'STARTER'), gte(businesses.createdAt, trialThreshold))),
    ]);

    const planMap: Record<string, number> = {};
    for (const r of planCounts) planMap[r.tier] = Number(r.count);
    const starterPaid = Math.max(0, (planMap['STARTER'] ?? 0) - Number(activeTrialCount[0]?.n ?? 0));
    const starterMrr = starterPaid * 15000;
    const growthMrr = (planMap['GROWTH'] ?? 0) * 45000;
    const mrr = starterMrr + growthMrr;
    const totalCalls = Number(callCount[0].n);
    const aiResolved = Number(resolvedCalls[0].n);
    const thisMonthCalls = Number(callsThisMonth[0].n);
    const lastMonthCalls = Number(callsLastMonth[0].n);

    return res.json({
      totalBusinesses: Number(bizCount[0].n),
      activeBusinesses: Number(activeBiz[0].n),
      newBusinessesThisMonth: Number(newBizThisMonth[0].n),
      activeTrials: Number(activeTrialCount[0]?.n ?? 0),
      trialsExpiringSoon: 0,
      activeCalls: Number(activeCalls[0].n),
      callsThisMonth: thisMonthCalls,
      callsGrowthPct: lastMonthCalls > 0 ? ((thisMonthCalls - lastMonthCalls) / lastMonthCalls) * 100 : 0,
      mrr,
      mrrGrowth: 0,
      aiResolutionRate: totalCalls > 0 ? (aiResolved / totalCalls) * 100 : 0,
      aiResolutionRateChange: 0,
      escalationsToday: Number(escalationsToday[0].n),
      escalationBusinessCount: Number(escalationBizToday[0].n),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/admin/businesses:
 *   get:
 *     tags: [Admin]
 *     summary: List all businesses with filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: tier
 *         schema: { type: string, enum: [STARTER, GROWTH, ENTERPRISE] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Paginated business list
 */
adminRouter.get('/businesses', async (req, res, next) => {
  try {
    const { page, limit, search } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      search: z.string().optional(),
    }).parse(req.query);

    const conditions: any[] = [];
    if (search) conditions.push(ilike(businesses.name, `%${search}%`));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select({
        id: businesses.id,
        name: businesses.name,
        industry: businesses.industry,
        subscriptionTier: businesses.subscriptionTier,
        isActive: businesses.isActive,
        createdAt: businesses.createdAt,
        connectorEnabled: dataConnectors.enabled,
        connectorBaseUrl: dataConnectors.baseUrl,
      })
        .from(businesses)
        .leftJoin(dataConnectors, eq(dataConnectors.businessId, businesses.id))
        .where(where)
        .orderBy(desc(businesses.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(businesses).where(where),
    ]);

    const enriched = await Promise.all(rows.map(async (b) => {
      const [ownerRows, callCountRows] = await Promise.all([
        db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(and(eq(users.businessId, b.id), eq(users.role, 'OWNER'))).limit(1),
        db.select({ n: sql<number>`count(*)` }).from(calls).where(eq(calls.businessId, b.id)),
      ]);
      const owner = ownerRows[0];
      const planMrr: Record<string, number> = { STARTER: 25, GROWTH: 45, ONE_TIME: 0, ENTERPRISE: 0 };
      const isTrial = b.subscriptionTier === 'STARTER' && (Date.now() - new Date(b.createdAt).getTime()) < 10 * 24 * 60 * 60 * 1000;
      return {
        id: b.id,
        name: b.name,
        industry: b.industry ?? '',
        owner: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email : 'Unknown',
        email: owner?.email ?? '',
        plan: isTrial ? 'Trial' : b.subscriptionTier === 'ONE_TIME' ? 'One-time' : b.subscriptionTier === 'STARTER' ? 'Starter' : b.subscriptionTier === 'GROWTH' ? 'Growth' : 'Enterprise',
        status: b.isActive ? 'active' : 'suspended',
        calls: Number(callCountRows[0]?.n ?? 0),
        mrr: isTrial ? 0 : planMrr[b.subscriptionTier] ?? 0,
        joined: b.createdAt.toISOString(),
        dbConnected: Boolean((b as any).connectorEnabled) && Boolean((b as any).connectorBaseUrl),
      };
    }));

    const total = Number(countResult[0].n);
    return res.json(enriched); // UI expects array directly
  } catch (err) {
    next(err);
  }
});

// ─── GET /admin/businesses/recent ─────────────────────────────────────────────
adminRouter.get('/businesses/recent', async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        plan: businesses.subscriptionTier,
        createdAt: businesses.createdAt,
        ownerEmail: users.email,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
        connectorEnabled: dataConnectors.enabled,
        connectorBaseUrl: dataConnectors.baseUrl,
      })
      .from(businesses)
      .leftJoin(users, and(eq(users.businessId, businesses.id), eq(users.role, 'OWNER')))
      .leftJoin(dataConnectors, eq(dataConnectors.businessId, businesses.id))
      .orderBy(desc(businesses.createdAt))
      .limit(10);

    return res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      plan: (r.plan === 'STARTER' && (Date.now() - new Date(r.createdAt).getTime()) < 10 * 24 * 60 * 60 * 1000)
        ? 'Trial'
        : r.plan === 'ONE_TIME'
          ? 'One-time'
          : r.plan === 'STARTER'
            ? 'Starter'
            : r.plan === 'GROWTH'
              ? 'Growth'
              : 'Enterprise',
      joinedAt: r.createdAt,
      owner: r.ownerFirstName
        ? `${r.ownerFirstName} ${r.ownerLastName ?? ''}`.trim()
        : (r.ownerEmail ?? 'Unknown'),
      dbConnected: Boolean((r as any).connectorEnabled) && Boolean((r as any).connectorBaseUrl),
    })));
  } catch (err) { next(err); }
});

adminRouter.get('/contact-submissions/recent', async (req, res, next) => {
  try {
    const { limit } = z.object({ limit: z.coerce.number().min(1).max(50).default(10) }).parse(req.query);
    const rows = await db.select({
      id: contactSubmissions.id,
      firstName: contactSubmissions.firstName,
      lastName: contactSubmissions.lastName,
      email: contactSubmissions.email,
      businessName: contactSubmissions.businessName,
      reason: contactSubmissions.reason,
      message: contactSubmissions.message,
      status: contactSubmissions.status,
      createdAt: contactSubmissions.createdAt,
    }).from(contactSubmissions).orderBy(desc(contactSubmissions.createdAt)).limit(limit);

    return res.json(rows.map(r => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
      businessName: r.businessName,
      reason: r.reason,
      message: r.message,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    if (isMissingDbObject(err)) {
      logger.warn({ err }, 'contact_submissions table missing (migration not applied yet)');
      return res.json([]);
    }
    next(err);
  }
});

adminRouter.get('/contact-submissions', async (req, res, next) => {
  try {
    const { page, limit, q } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
      q: z.string().optional(),
    }).parse(req.query);

    const where = q
      ? or(
        ilike(contactSubmissions.email, `%${q}%`),
        ilike(contactSubmissions.firstName, `%${q}%`),
        ilike(contactSubmissions.lastName, `%${q}%`),
        ilike(contactSubmissions.businessName, `%${q}%`),
        ilike(contactSubmissions.message, `%${q}%`),
      )
      : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(contactSubmissions).where(where).orderBy(desc(contactSubmissions.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(contactSubmissions).where(where),
    ]);

    return res.json({
      page,
      limit,
      total: Number(countResult[0]?.n ?? 0),
      items: rows.map(r => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`.trim(),
        email: r.email,
        businessName: r.businessName,
        reason: r.reason,
        message: r.message,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (isMissingDbObject(err)) {
      logger.warn({ err }, 'contact_submissions table missing (migration not applied yet)');
      return res.json({ page: 1, limit: 30, total: 0, items: [] });
    }
    next(err);
  }
});

adminRouter.get('/phone-number-requests/recent', async (req, res, next) => {
  try {
    const { limit } = z.object({ limit: z.coerce.number().min(1).max(50).default(10) }).parse(req.query);
    const rows = await db.select({
      id: phoneNumberRequests.id,
      businessId: phoneNumberRequests.businessId,
      businessName: businesses.name,
      quantity: phoneNumberRequests.quantity,
      amountUsd: phoneNumberRequests.amountUsd,
      checkoutUrl: phoneNumberRequests.checkoutUrl,
      note: phoneNumberRequests.note,
      status: phoneNumberRequests.status,
      createdAt: phoneNumberRequests.createdAt,
    })
      .from(phoneNumberRequests)
      .leftJoin(businesses, eq(businesses.id, phoneNumberRequests.businessId))
      .orderBy(desc(phoneNumberRequests.createdAt))
      .limit(limit);

    return res.json(rows.map(r => ({
      id: r.id,
      businessId: r.businessId,
      businessName: r.businessName ?? 'Unknown',
      quantity: r.quantity,
      amountUsd: r.amountUsd,
      checkoutUrl: r.checkoutUrl,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    if (isMissingDbObject(err)) {
      logger.warn({ err }, 'phone_number_requests table missing (migration not applied yet)');
      return res.json([]);
    }
    next(err);
  }
});

adminRouter.get('/phone-number-requests', async (req, res, next) => {
  try {
    const { page, limit, q, status } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
      q: z.string().optional(),
      status: z.string().optional(),
    }).parse(req.query);

    const conditions: any[] = [];
    if (status) conditions.push(eq(phoneNumberRequests.status, status));
    if (q) {
      conditions.push(or(
        ilike(businesses.name, `%${q}%`),
        ilike(phoneNumberRequests.note, `%${q}%`),
      ));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select({
        id: phoneNumberRequests.id,
        businessId: phoneNumberRequests.businessId,
        businessName: businesses.name,
        quantity: phoneNumberRequests.quantity,
        amountUsd: phoneNumberRequests.amountUsd,
        checkoutUrl: phoneNumberRequests.checkoutUrl,
        note: phoneNumberRequests.note,
        status: phoneNumberRequests.status,
        createdAt: phoneNumberRequests.createdAt,
      })
        .from(phoneNumberRequests)
        .leftJoin(businesses, eq(businesses.id, phoneNumberRequests.businessId))
        .where(where)
        .orderBy(desc(phoneNumberRequests.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` })
        .from(phoneNumberRequests)
        .leftJoin(businesses, eq(businesses.id, phoneNumberRequests.businessId))
        .where(where),
    ]);

    return res.json({
      page,
      limit,
      total: Number(countResult[0]?.n ?? 0),
      items: rows.map(r => ({
        id: r.id,
        businessId: r.businessId,
        businessName: r.businessName ?? 'Unknown',
        quantity: r.quantity,
        amountUsd: r.amountUsd,
        checkoutUrl: r.checkoutUrl,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (isMissingDbObject(err)) {
      logger.warn({ err }, 'phone_number_requests table missing (migration not applied yet)');
      return res.json({ page: 1, limit: 30, total: 0, items: [] });
    }
    next(err);
  }
});

adminRouter.patch('/phone-number-requests/:id', async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['NEW', 'IN_REVIEW', 'FULFILLED', 'REJECTED']) }).parse(req.body);
    const [updated] = await db.update(phoneNumberRequests).set({ status }).where(eq(phoneNumberRequests.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ error: 'Request not found' });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/admin/businesses/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get full business detail
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Business with users and recent calls
 *       404:
 *         description: Not found
 */
adminRouter.get('/businesses/:id', async (req, res, next) => {
  try {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);

    const [members, recentCalls, callTotal, callMonth, escalationCount, agentRow, connectorRow] = await Promise.all([
      db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role })
        .from(users).where(eq(users.businessId, req.params.id)),
      db.select({ id: calls.id, callerNumber: calls.callerNumber, duration: calls.duration, resolution: calls.resolution, intent: calls.intent, startedAt: calls.startedAt, recordingUrl: calls.recordingUrl })
        .from(calls).where(eq(calls.businessId, req.params.id)).orderBy(desc(calls.startedAt)).limit(10),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(eq(calls.businessId, req.params.id)),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(and(eq(calls.businessId, req.params.id), gte(calls.startedAt, startOfMonth))),
      db.select({ n: sql<number>`count(*)` }).from(escalations).where(eq(escalations.businessId, req.params.id)),
      db.select().from(agentConfigs).where(eq(agentConfigs.businessId, req.params.id)).limit(1),
      db.select({
        baseUrl: dataConnectors.baseUrl,
        enabled: dataConnectors.enabled,
        lastTestAt: dataConnectors.lastTestAt,
        lastTestStatus: dataConnectors.lastTestStatus,
      }).from(dataConnectors).where(eq(dataConnectors.businessId, req.params.id)).limit(1),
    ]);

    const owner = members.find(m => m.role === 'OWNER');
    const total = Number(callTotal[0]?.n ?? 0);
    const aiResolved = recentCalls.filter(c => c.resolution === 'AI').length;
    const planMrr: Record<string, number> = { STARTER: 25, GROWTH: 45, ONE_TIME: 0, ENTERPRISE: 0 };
    const agent = agentRow[0];
    const isTrial = biz.subscriptionTier === 'STARTER' && (Date.now() - new Date(biz.createdAt).getTime()) < 10 * 24 * 60 * 60 * 1000;

    return res.json({
      id: biz.id,
      name: biz.name,
      industry: biz.industry ?? '',
      owner: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email : 'Unknown',
      email: owner?.email ?? '',
      phone: undefined,
      plan: isTrial ? 'Trial' : biz.subscriptionTier === 'ONE_TIME' ? 'One-time' : biz.subscriptionTier === 'STARTER' ? 'Starter' : biz.subscriptionTier === 'GROWTH' ? 'Growth' : 'Enterprise',
      status: biz.isActive ? 'active' : 'suspended',
      joined: biz.createdAt.toISOString(),
      mrr: isTrial ? 0 : planMrr[biz.subscriptionTier] ?? 0,
      callsThisMonth: Number(callMonth[0]?.n ?? 0),
      callsTotal: total,
      resolutionRate: total > 0 ? Math.round((aiResolved / Math.min(total, 10)) * 100) : 0,
      escalations: Number(escalationCount[0]?.n ?? 0),
      dbConnected: Boolean(connectorRow?.[0]?.enabled) && Boolean(connectorRow?.[0]?.baseUrl),
      dataConnector: connectorRow?.[0]
        ? {
          enabled: connectorRow[0].enabled,
          baseUrl: connectorRow[0].baseUrl,
          lastTestAt: connectorRow[0].lastTestAt?.toISOString?.() ?? null,
          lastTestStatus: connectorRow[0].lastTestStatus ?? null,
        }
        : null,
      agent: agent ? {
        voiceId: agent.voiceId,
        tone: agent.tone,
        greeting: agent.greeting,
        faqCount: undefined,
      } : undefined,
      team: members.map(m => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email,
        email: m.email,
        role: m.role,
      })),
      recentCalls: recentCalls.map(c => ({
        id: c.id,
        caller: c.callerNumber,
        durationSeconds: c.duration ?? 0,
        resolution: c.resolution ?? 'ABANDONED',
        intent: c.intent,
        startedAt: c.startedAt.toISOString(),
        recordingUrl: c.recordingUrl,
      })),
      invoices: [],
      subscription: { nextBillingAt: undefined },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/admin/businesses/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update business plan or status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subscriptionTier: { type: string, enum: [STARTER, GROWTH, ENTERPRISE] }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated business
 */
adminRouter.patch('/businesses/:id', async (req, res, next) => {
  try {
    const { plan, status } = z.object({
      plan: z.string().optional(),
      status: z.string().optional(),
    }).parse(req.body);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (plan) {
      const tierMap: Record<string, string> = { Starter: 'STARTER', Growth: 'GROWTH', Enterprise: 'ENTERPRISE' };
      update.subscriptionTier = tierMap[plan] ?? plan.toUpperCase();
    }
    if (status !== undefined) update.isActive = status === 'active' || status === 'trial';

    const [result] = await db.update(businesses).set(update).where(eq(businesses.id, req.params.id)).returning();
    if (!result) return res.status(404).json({ error: 'Business not found' });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Admin: Products & Services (Catalog) ─────────────────────────────────────

adminRouter.get('/businesses/:id/catalog', async (req, res, next) => {
  try {
    const { q, type } = z.object({
      q: z.string().optional(),
      type: z.enum(['PRODUCT', 'SERVICE']).optional(),
    }).parse(req.query);

    const conditions: any[] = [eq(catalogItems.businessId, req.params.id)];
    if (type) conditions.push(eq(catalogItems.type, type));
    if (q?.trim()) conditions.push(sql`${catalogItems.name} ILIKE ${'%' + q.trim() + '%'}`);
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select().from(catalogItems).where(where).orderBy(catalogItems.createdAt);
    return res.json(rows);
  } catch (err) { next(err); }
});

adminRouter.post('/businesses/:id/catalog', async (req, res, next) => {
  try {
    const data = z.object({
      type: z.enum(['PRODUCT', 'SERVICE']),
      name: z.string().min(1),
      description: z.string().optional().nullable(),
      price: z.number().int().nonnegative().optional().nullable(),
      currency: z.string().min(3).max(3).optional(),
      isAvailable: z.boolean().optional(),
      availabilityNote: z.string().optional().nullable(),
      tags: z.array(z.string()).optional(),
    }).parse(req.body);

    const [row] = await db.insert(catalogItems).values({
      businessId: req.params.id,
      type: data.type,
      name: data.name,
      description: data.description ?? null,
      price: data.price ?? null,
      currency: data.currency ?? 'NGN',
      isAvailable: data.isAvailable ?? true,
      availabilityNote: data.availabilityNote ?? null,
      tags: data.tags ?? [],
      updatedAt: new Date(),
    }).returning();

    return res.status(201).json(row);
  } catch (err) { next(err); }
});

adminRouter.patch('/businesses/:id/catalog/:itemId', async (req, res, next) => {
  try {
    const data = z.object({
      type: z.enum(['PRODUCT', 'SERVICE']).optional(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      price: z.number().int().nonnegative().optional().nullable(),
      currency: z.string().min(3).max(3).optional(),
      isAvailable: z.boolean().optional(),
      availabilityNote: z.string().optional().nullable(),
      tags: z.array(z.string()).optional(),
    }).parse(req.body);

    const [row] = await db.update(catalogItems).set({
      ...data,
      description: data.description === undefined ? undefined : (data.description ?? null),
      price: data.price === undefined ? undefined : (data.price ?? null),
      availabilityNote: data.availabilityNote === undefined ? undefined : (data.availabilityNote ?? null),
      updatedAt: new Date(),
    }).where(and(eq(catalogItems.id, req.params.itemId), eq(catalogItems.businessId, req.params.id))).returning();

    if (!row) return res.status(404).json({ error: 'Item not found' });
    return res.json(row);
  } catch (err) { next(err); }
});

adminRouter.delete('/businesses/:id/catalog/:itemId', async (req, res, next) => {
  try {
    await db.delete(catalogItems).where(and(eq(catalogItems.id, req.params.itemId), eq(catalogItems.businessId, req.params.id)));
    return res.status(204).send();
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [OWNER, ADMIN] }
 *     responses:
 *       200:
 *         description: Paginated user list
 */
adminRouter.get('/users', async (req, res, next) => {
  try {
    const { page, limit, search, role } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      search: z.string().optional(),
      role: z.enum(['OWNER', 'ADMIN']).optional(),
    }).parse(req.query);

    const conditions: any[] = [];
    if (search) conditions.push(ilike(users.email, `%${search}%`));
    if (role) conditions.push(eq(users.role, role));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        businessId: users.businessId,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        businessName: businesses.name,
      }).from(users)
        .leftJoin(businesses, eq(businesses.id, users.businessId))
        .where(where).orderBy(desc(users.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(users).where(where),
    ]);

    const total = Number(countResult[0].n);
    return res.json(rows.map(u => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      email: u.email,
      business: u.businessName ?? '—',
      role: u.role,
      lastActive: u.createdAt.toISOString(),
      status: u.emailVerified ? 'active' : 'suspended',
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/admin/calls:
 *   get:
 *     tags: [Admin]
 *     summary: List all calls across all businesses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated calls
 */
adminRouter.get('/calls', async (req, res, next) => {
  try {
    const { page, limit } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(50),
    }).parse(req.query);

    const [rows, countResult] = await Promise.all([
      db.select({
        id: calls.id,
        callerNumber: calls.callerNumber,
        duration: calls.duration,
        resolution: calls.resolution,
        status: calls.status,
        intent: calls.intent,
        startedAt: calls.startedAt,
        recordingUrl: calls.recordingUrl,
        businessName: businesses.name,
      }).from(calls)
        .leftJoin(businesses, eq(businesses.id, calls.businessId))
        .orderBy(desc(calls.startedAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(calls),
    ]);

    const total = Number(countResult[0].n);
    return res.json({
      calls: rows.map(c => ({
        id: c.id,
        business: c.businessName ?? '—',
        caller: c.callerNumber,
        durationSeconds: c.duration ?? 0,
        status: c.status,
        resolution: c.resolution ?? 'ABANDONED',
        intent: c.intent,
        startedAt: c.startedAt.toISOString(),
        recordingUrl: c.recordingUrl,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/admin/test-email:
 *   post:
 *     tags: [Admin]
 *     summary: Send a test email (and optionally preview a specific template)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to: { type: string, format: email }
 *               template: { type: string, enum: [test, verification, password-reset, team-invite, subscription-confirm, subscription-cancelled] }
 *     responses:
 *       200:
 *         description: Email sent
 */
adminRouter.post('/test-email', async (req, res, next) => {
  try {
    const { to, template } = z.object({
      to: z.string().email().default('info.miluai@gmail.com'),
      template: z.enum(['test', 'verification', 'password-reset', 'team-invite', 'subscription-confirm', 'subscription-cancelled']).default('test'),
    }).parse(req.body);

    switch (template) {
      case 'verification':
        await sendVerificationEmail(to, 'demo-token-abc123');
        break;
      case 'password-reset':
        await sendPasswordResetEmail(to, 'demo-reset-token-xyz789');
        break;
      case 'team-invite':
        await sendTeamInviteEmail(to, 'Amaka\'s Boutique', 'TempPass@123');
        break;
      case 'subscription-confirm':
        await sendSubscriptionConfirmEmail(to, 'GROWTH', 'Amaka\'s Boutique');
        break;
      case 'subscription-cancelled':
        await sendSubscriptionCancelledEmail(to, 'Amaka\'s Boutique');
        break;
      default:
        await sendTestEmail(to);
    }

    return res.json({ message: `${template} email sent to ${to}` });
  } catch (err) { next(err); }
});

// ─── PATCH /admin/users/:id — suspend/unsuspend or update profile ─────────────
adminRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const schema = z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      role: z.enum(['OWNER', 'ADMIN']).optional(),
      password: z.string().min(8).optional(),
      // status is frontend-only (no DB column); we use emailVerified as proxy for suspension
      status: z.enum(['active', 'inactive', 'suspended']).optional(),
    });
    const { firstName, lastName, role, password, status } = schema.parse(req.body);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (firstName !== undefined) update.firstName = firstName;
    if (lastName !== undefined) update.lastName = lastName;
    if (role !== undefined) update.role = role;
    if (password) update.password = await bcrypt.hash(password, 10);
    // suspended → emailVerified = false, active → true
    if (status === 'suspended') update.emailVerified = false;
    if (status === 'active') update.emailVerified = true;

    const [result] = await db.update(users).set(update).where(eq(users.id, req.params.id)).returning({
      id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
      role: users.role, emailVerified: users.emailVerified,
    });
    if (!result) return res.status(404).json({ error: 'User not found' });
    return res.json(result);
  } catch (err) { next(err); }
});

// ─── GET /admin/analytics/revenue ─────────────────────────────────────────────
adminRouter.get('/analytics/revenue', async (_req, res, next) => {
  try {
    // Return MRR by month for last 6 months based on business createdAt as proxy
    const rows = await db.execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') AS month,
             COUNT(*) * 15000 AS mrr
      FROM businesses
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `);
    return res.json(rows.rows.map((r: any) => ({ month: r.month, mrr: Number(r.mrr) })));
  } catch (err) { next(err); }
});

// ─── GET /admin/analytics/call-volume ─────────────────────────────────────────
adminRouter.get('/analytics/call-volume', async (_req, res, next) => {
  try {
    const rows = await db.execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('day', started_at), 'DD Mon') AS day,
             COUNT(*) AS calls
      FROM calls
      WHERE started_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE_TRUNC('day', started_at)
      ORDER BY DATE_TRUNC('day', started_at)
    `);
    return res.json(rows.rows.map((r: any) => ({ day: r.day, calls: Number(r.calls) })));
  } catch (err) { next(err); }
});

// ─── GET /admin/billing/overview ──────────────────────────────────────────────
adminRouter.get('/billing/overview', async (_req, res, next) => {
  try {
    const trialThreshold = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const [totalBiz, planRows, trialCountRows] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(businesses),
      db.select({ tier: businesses.subscriptionTier, count: sql<number>`count(*)` })
        .from(businesses).groupBy(businesses.subscriptionTier),
      db.select({ n: sql<number>`count(*)` })
        .from(businesses)
        .where(and(eq(businesses.subscriptionTier, 'STARTER'), gte(businesses.createdAt, trialThreshold))),
    ]);

    const planMap: Record<string, number> = {};
    for (const r of planRows) planMap[r.tier] = Number(r.count);

    const starterMrr = (planMap['STARTER'] ?? 0) * 25;
    const growthMrr = (planMap['GROWTH'] ?? 0) * 45;
    const mrr = starterMrr + growthMrr;
    const trialsCount = Number(trialCountRows[0]?.n ?? 0);

    return res.json({
      mrr,
      arr: mrr * 12,
      activeSubscriptions: Number(totalBiz[0].n),
      trialsCount,
      trialConversionRate: 0,
      planDistribution: [
        { name: 'Starter', value: planMap['STARTER'] ?? 0, color: '#6366f1' },
        { name: 'Growth', value: planMap['GROWTH'] ?? 0, color: '#22c55e' },
        { name: 'One-time', value: planMap['ONE_TIME'] ?? 0, color: '#0ea5e9' },
        { name: 'Enterprise', value: planMap['ENTERPRISE'] ?? 0, color: '#f59e0b' },
      ],
    });
  } catch (err) { next(err); }
});

// ─── GET /admin/billing/subscriptions ─────────────────────────────────────────
adminRouter.get('/billing/subscriptions', async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        plan: businesses.subscriptionTier,
        isActive: businesses.isActive,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .orderBy(desc(businesses.createdAt))
      .limit(50);

    return res.json(rows.map(r => ({
      id: r.id,
      business: r.name,
      plan: (r.plan === 'STARTER' && (Date.now() - new Date(r.createdAt).getTime()) < 10 * 24 * 60 * 60 * 1000)
        ? 'Trial'
        : r.plan === 'ONE_TIME'
          ? 'One-time'
          : r.plan === 'STARTER'
            ? 'Starter'
            : r.plan === 'GROWTH'
              ? 'Growth'
              : 'Enterprise',
      status: (r.plan === 'STARTER' && (Date.now() - new Date(r.createdAt).getTime()) < 10 * 24 * 60 * 60 * 1000)
        ? 'trial'
        : r.isActive
          ? 'active'
          : 'cancelled',
      mrr: (r.plan === 'STARTER' && (Date.now() - new Date(r.createdAt).getTime()) < 10 * 24 * 60 * 60 * 1000)
        ? 0
        : r.plan === 'STARTER'
          ? 25
          : r.plan === 'GROWTH'
            ? 45
            : 0,
      nextBillingAt: (r.plan === 'STARTER' && (Date.now() - new Date(r.createdAt).getTime()) < 10 * 24 * 60 * 60 * 1000)
        ? new Date(new Date(r.createdAt).getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
        : r.plan === 'ONE_TIME'
          ? new Date(new Date(r.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(new Date(r.createdAt).setMonth(new Date(r.createdAt).getMonth() + 1)).toISOString(),
    })));
  } catch (err) { next(err); }
});

// ─── GET /admin/settings ──────────────────────────────────────────────────────
adminRouter.get('/settings', (_req, res) => {
  return res.json({
    twilioAccountSid: env.TWILIO_ACCOUNT_SID ?? '',
    twilioPhoneNumber: env.TWILIO_PHONE_NUMBER ?? '',
    defaultVoice: env.ELEVENLABS_VOICE_ID ?? 'default',
    maxCallsPerBiz: 1000,
    trialDays: 10,
    webhookSecret: env.WHOP_WEBHOOK_SECRET ?? '',
    maintenanceMode: false,
    // Legacy AT fields returned as empty (Twilio is primary provider)
    atApiKey: '',
    atUsername: '',
  });
});

// ─── PATCH /admin/settings ────────────────────────────────────────────────────
adminRouter.patch('/settings', (_req, res) => {
  // Settings are env-based; acknowledge save without persisting
  return res.json({ message: 'Settings noted (restart required for env changes)' });
});

// ─── Phone number management ─────────────────────────────────────────────────

adminRouter.get('/twilio/available-numbers', async (req, res, next) => {
  try {
    const client = getTwilioClient();
    if (!client) return res.status(400).json({ error: 'Twilio is not configured' });

    const { countryCode, type, areaCode, limit } = z.object({
      countryCode: z.string().length(2).default('NG'),
      type: z.enum(['local', 'tollFree', 'mobile', 'national']).default('local'),
      areaCode: z.string().optional(),
      limit: z.coerce.number().min(1).max(50).default(10),
    }).parse(req.query);

    const baseOpts: Record<string, unknown> = { limit, voiceEnabled: true };
    if (areaCode) baseOpts.areaCode = areaCode;

    const list = await (type === 'tollFree'
      ? client.availablePhoneNumbers(countryCode).tollFree.list(baseOpts as any)
      : type === 'mobile'
        ? client.availablePhoneNumbers(countryCode).mobile.list(baseOpts as any)
        : type === 'national'
          ? client.availablePhoneNumbers(countryCode).national.list(baseOpts as any)
          : client.availablePhoneNumbers(countryCode).local.list(baseOpts as any)
    );

    return res.json(list.map((n: any) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality,
      region: n.region,
      isoCountry: n.isoCountry,
      capabilities: n.capabilities,
    })));
  } catch (err) { next(err); }
});

adminRouter.get('/twilio/incoming-numbers', async (req, res, next) => {
  try {
    const client = getTwilioClient();
    if (!client) return res.status(400).json({ error: 'Twilio is not configured' });

    const { limit, search } = z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      search: z.string().optional(),
    }).parse(req.query);

    const list = await client.incomingPhoneNumbers.list({ limit });
    const filtered = (search?.trim()
      ? list.filter((n: any) => {
        const q = search.trim().toLowerCase();
        return String(n.phoneNumber ?? '').toLowerCase().includes(q)
          || String(n.friendlyName ?? '').toLowerCase().includes(q);
      })
      : list
    );

    const sids = filtered.map((n: any) => n.sid).filter(Boolean) as string[];
    const assignedRows = sids.length
      ? await db.select({
        providerNumberId: phoneNumbers.providerNumberId,
        businessId: phoneNumbers.businessId,
        businessName: businesses.name,
      })
        .from(phoneNumbers)
        .leftJoin(businesses, eq(businesses.id, phoneNumbers.businessId))
        .where(and(eq(phoneNumbers.provider, 'twilio'), inArray(phoneNumbers.providerNumberId, sids)))
      : [];

    const assignedBySid = new Map<string, { businessId: string; businessName: string }>();
    for (const row of assignedRows) {
      if (row.providerNumberId && row.businessId) {
        assignedBySid.set(row.providerNumberId, { businessId: row.businessId, businessName: row.businessName ?? '' });
      }
    }

    return res.json(filtered.map((n: any) => {
      const assigned = assignedBySid.get(n.sid);
      return {
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        dateCreated: n.dateCreated,
        capabilities: n.capabilities,
        assignedBusinessId: assigned?.businessId ?? null,
        assignedBusinessName: assigned?.businessName ?? null,
      };
    }));
  } catch (err) { next(err); }
});

adminRouter.get('/whatsapp/messages', async (req, res, next) => {
  try {
    const { limit, before, search } = z.object({
      limit: z.coerce.number().min(1).max(200).default(50),
      before: z.string().optional(),
      search: z.string().optional(),
    }).parse(req.query);

    const conditions = [eq(notifications.channel, 'WHATSAPP')];
    if (before) conditions.push(lt(notifications.createdAt, new Date(before)));
    if (search?.trim()) conditions.push(ilike(notifications.recipient, `%${search.trim()}%`));

    const rows = await db.select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      status: notifications.status,
      recipient: notifications.recipient,
      data: notifications.data,
      createdAt: notifications.createdAt,
    }).from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return res.json(rows);
  } catch (err) { next(err); }
});

adminRouter.post('/whatsapp/send', async (req, res, next) => {
  try {
    const { to, message } = z.object({
      to: z.string().min(7),
      message: z.string().min(1),
    }).parse(req.body);

    const normalize = (v: string) => (v.startsWith('whatsapp:') ? v : `whatsapp:${v}`);
    const recipient = normalize(to.trim());

    const [notif] = await db.insert(notifications).values({
      channel: 'WHATSAPP',
      status: 'PENDING',
      title: 'Outgoing WhatsApp',
      body: message,
      recipient,
      data: { direction: 'outbound', to: recipient },
    }).returning();

    try {
      const msg = await sendWhatsAppText(recipient, message);
      const meta = msg?.sid ? { twilioSid: msg.sid, to: msg.to, from: msg.from, twilioStatus: msg.status } : {};
      const nextData = Object.keys(meta).length ? sql`${notifications.data} || ${JSON.stringify(meta)}::jsonb` : notifications.data;
      const normalized = (msg?.status ?? '').toLowerCase();
      const nextStatus = (normalized === 'delivered' || normalized === 'sent' || normalized === 'read')
        ? 'SENT'
        : 'PENDING';

      const [updated] = await db.update(notifications)
        .set({ status: nextStatus as any, data: nextData as any })
        .where(eq(notifications.id, notif.id))
        .returning();

      return res.json(updated ?? notif);
    } catch (err) {
      await db.update(notifications).set({ status: 'FAILED' }).where(eq(notifications.id, notif.id));
      throw err;
    }
  } catch (err) { next(err); }
});

adminRouter.post('/businesses/:id/phone-numbers/twilio/buy', async (req, res, next) => {
  try {
    const client = getTwilioClient();
    if (!client) return res.status(400).json({ error: 'Twilio is not configured' });

    const { phoneNumber, label } = z.object({
      phoneNumber: z.string().min(7),
      label: z.string().optional(),
    }).parse(req.body);

    const apiUrl = env.API_URL.replace(/\/$/, '');
    const incoming = await client.incomingPhoneNumbers.create({
      phoneNumber,
      friendlyName: label ?? 'Milu Number',
      voiceUrl: `${apiUrl}/webhooks/twilio/voice`,
      voiceMethod: 'POST',
      statusCallback: `${apiUrl}/webhooks/twilio/voice/status`,
      statusCallbackMethod: 'POST',
    });

    const [existing] = await db.select({
      id: phoneNumbers.id,
      provider: phoneNumbers.provider,
    }).from(phoneNumbers)
      .where(or(eq(phoneNumbers.number, incoming.phoneNumber), eq(phoneNumbers.providerNumberId, incoming.sid)))
      .limit(1);
    if (existing?.provider && existing.provider !== 'twilio') return res.status(409).json({ error: 'Number already exists with a different provider' });

    const nextLabel = label ?? incoming.friendlyName ?? 'Milu Number';
    const [row] = existing
      ? await db.update(phoneNumbers).set({
        businessId: req.params.id,
        verified: true,
        label: nextLabel,
        isVirtual: true,
        provider: 'twilio',
        providerNumberId: incoming.sid,
      }).where(eq(phoneNumbers.id, existing.id)).returning()
      : await db.insert(phoneNumbers).values({
        number: incoming.phoneNumber,
        businessId: req.params.id,
        verified: true,
        label: nextLabel,
        isVirtual: true,
        provider: 'twilio',
        providerNumberId: incoming.sid,
      }).returning();

    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    void notifyNumberAssigned(req.params.id, biz?.name ?? 'your business', row.number);

    return res.status(existing ? 200 : 201).json({ ...row, twilioSid: incoming.sid });
  } catch (err) { next(err); }
});

adminRouter.post('/businesses/:id/phone-numbers/twilio/assign', async (req, res, next) => {
  try {
    const client = getTwilioClient();
    if (!client) return res.status(400).json({ error: 'Twilio is not configured' });

    const { phoneNumberSid, phoneNumber, label } = z.object({
      phoneNumberSid: z.string().min(5),
      phoneNumber: z.string().min(7).optional(),
      label: z.string().optional(),
    }).parse(req.body);

    let number = phoneNumber;
    let friendlyName = label;
    let sid = phoneNumberSid;
    if (!number) {
      const incoming = await client.incomingPhoneNumbers(phoneNumberSid).fetch();
      number = incoming.phoneNumber;
      friendlyName = label ?? incoming.friendlyName ?? undefined;
      sid = incoming.sid;
    }

    const apiUrl = env.API_URL.replace(/\/$/, '');
    void client.incomingPhoneNumbers(phoneNumberSid).update({
      voiceUrl: `${apiUrl}/webhooks/twilio/voice`,
      voiceMethod: 'POST',
      statusCallback: `${apiUrl}/webhooks/twilio/voice/status`,
      statusCallbackMethod: 'POST',
      friendlyName: friendlyName ?? undefined,
    });

    const [existing] = await db.select({
      id: phoneNumbers.id,
      provider: phoneNumbers.provider,
    }).from(phoneNumbers)
      .where(or(eq(phoneNumbers.number, number), eq(phoneNumbers.providerNumberId, sid)))
      .limit(1);
    if (existing?.provider && existing.provider !== 'twilio') return res.status(409).json({ error: 'Number already exists with a different provider' });

    const nextLabel = friendlyName ?? 'Milu Number';
    const [row] = existing
      ? await db.update(phoneNumbers).set({
        businessId: req.params.id,
        verified: true,
        label: nextLabel,
        isVirtual: true,
        provider: 'twilio',
        providerNumberId: sid,
      }).where(eq(phoneNumbers.id, existing.id)).returning()
      : await db.insert(phoneNumbers).values({
        number,
        businessId: req.params.id,
        verified: true,
        label: nextLabel,
        isVirtual: true,
        provider: 'twilio',
        providerNumberId: sid,
      }).returning();

    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    void notifyNumberAssigned(req.params.id, biz?.name ?? 'your business', row.number);

    return res.status(existing ? 200 : 201).json({ ...row, twilioSid: sid });
  } catch (err) { next(err); }
});

adminRouter.post('/businesses/:id/phone-numbers/at/attach', async (req, res, next) => {
  try {
    const body = z.object({
      number: z.string().min(7),
      label: z.string().optional(),
      providerNumberId: z.string().optional(),
      isVirtual: z.boolean().default(true),
    }).parse(req.body);

    const [existing] = await db.select({ id: phoneNumbers.id, provider: phoneNumbers.provider }).from(phoneNumbers)
      .where(eq(phoneNumbers.number, body.number))
      .limit(1);
    if (existing?.provider && existing.provider !== 'at') return res.status(409).json({ error: 'Number already exists with a different provider' });

    const [row] = existing
      ? await db.update(phoneNumbers).set({
        businessId: req.params.id,
        verified: true,
        label: body.label ?? null,
        isVirtual: body.isVirtual,
        provider: 'at',
        providerNumberId: body.providerNumberId ?? null,
      }).where(eq(phoneNumbers.id, existing.id)).returning()
      : await db.insert(phoneNumbers).values({
        number: body.number,
        businessId: req.params.id,
        verified: true,
        label: body.label ?? null,
        isVirtual: body.isVirtual,
        provider: 'at',
        providerNumberId: body.providerNumberId ?? null,
      }).returning();

    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    void notifyNumberAssigned(req.params.id, biz?.name ?? 'your business', row.number);

    return res.status(existing ? 200 : 201).json(row);
  } catch (err) { next(err); }
});

adminRouter.get('/businesses/:id/phone-numbers', async (req, res, next) => {
  try {
    const rows = await db.select().from(phoneNumbers)
      .where(eq(phoneNumbers.businessId, req.params.id))
      .orderBy(desc(phoneNumbers.createdAt));
    return res.json(rows);
  } catch (err) { next(err); }
});

adminRouter.post('/businesses/:id/phone-numbers', async (req, res, next) => {
  try {
    const body = z.object({
      number: z.string().min(7),
      label: z.string().optional(),
      provider: z.enum(['twilio', 'at']).default('twilio'),
      providerNumberId: z.string().optional(),
      isVirtual: z.boolean().default(true),
    }).parse(req.body);

    const [existing] = await db.select({ id: phoneNumbers.id, provider: phoneNumbers.provider }).from(phoneNumbers)
      .where(eq(phoneNumbers.number, body.number))
      .limit(1);
    if (existing && existing.provider && existing.provider !== body.provider) return res.status(409).json({ error: 'Number already exists with a different provider' });

    const [row] = existing
      ? await db.update(phoneNumbers).set({
        businessId: req.params.id,
        verified: true,
        label: body.label ?? null,
        isVirtual: body.isVirtual,
        provider: body.provider,
        providerNumberId: body.providerNumberId ?? null,
      }).where(eq(phoneNumbers.id, existing.id)).returning()
      : await db.insert(phoneNumbers).values({
        ...body,
        businessId: req.params.id,
        verified: true,
      }).returning();

    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    void notifyNumberAssigned(req.params.id, biz?.name ?? 'your business', row.number);

    return res.status(existing ? 200 : 201).json(row);
  } catch (err) { next(err); }
});

adminRouter.delete('/businesses/:id/phone-numbers/:numberId', async (req, res, next) => {
  try {
    const [deleted] = await db.delete(phoneNumbers)
      .where(and(eq(phoneNumbers.id, req.params.numberId), eq(phoneNumbers.businessId, req.params.id)))
      .returning({ id: phoneNumbers.id });
    if (!deleted) return res.status(404).json({ error: 'Number not found' });
    return res.status(204).send();
  } catch (err) { next(err); }
});

// ─── POST /admin/test-whatsapp ────────────────────────────────────────────────
adminRouter.post('/test-whatsapp', async (req, res, next) => {
  try {
    const { to, type } = z.object({
      to: z.string().min(7),
      type: z.enum(['escalation', 'order', 'appointment', 'callback', 'missed_call', 'weekly_summary']).default('escalation'),
    }).parse(req.body);

    switch (type) {
      case 'escalation':
        await sendEscalationAlert(to, '+2348012345678', 'Customer is asking about a delayed order and is frustrated.');
        break;
      case 'order':
        await sendOrderConfirmation(to, 'ORD-001', [{ name: 'Jollof Rice', qty: 2 }, { name: 'Chicken', qty: 1 }], 'Amaka\'s Kitchen');
        break;
      case 'appointment':
        await sendAppointmentReminder(to, 'Hair Braiding', 'Saturday, 26 Apr 2026 at 10:00 AM', 'Chioma\'s Salon');
        break;
      case 'callback':
        await sendCallbackRequest(to, '+2348098765432', 'Tunde\'s Pharmacy');
        break;
      case 'missed_call':
        await sendMissedCallAlert(to, '+2347011223344', 'Emeka\'s Store');
        break;
      case 'weekly_summary':
        await sendWeeklySummary(to, 'Amaka\'s Kitchen', { totalCalls: 47, resolved: 38, escalated: 9, avgDuration: 94 });
        break;
    }

    return res.json({ message: `WhatsApp ${type} test sent to ${to}` });
  } catch (err) { next(err); }
});
