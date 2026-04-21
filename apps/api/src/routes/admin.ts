import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, ilike, and, sql, gte } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, businesses, users, calls, escalations, phoneNumbers } from '../db';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin-guard';
import { env } from '../config/env';
import { sendTestEmail, sendVerificationEmail, sendPasswordResetEmail, sendTeamInviteEmail, sendSubscriptionConfirmEmail, sendSubscriptionCancelledEmail } from '../utils/email';
import { sendEscalationAlert, sendOrderConfirmation, sendAppointmentReminder, sendCallbackRequest, sendMissedCallAlert, sendWeeklySummary } from '../services/whatsapp';

export const adminRouter: Router = Router();
adminRouter.use(authMiddleware, adminGuard);

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
    const [bizCount, userCount, callCount, escalationCount, activeBiz] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(businesses),
      db.select({ n: sql<number>`count(*)` }).from(users),
      db.select({ n: sql<number>`count(*)` }).from(calls),
      db.select({ n: sql<number>`count(*)` }).from(escalations),
      db.select({ n: sql<number>`count(*)` }).from(businesses).where(eq(businesses.isActive, true)),
    ]);

    const planCounts = await db
      .select({ tier: businesses.subscriptionTier, count: sql<number>`count(*)` })
      .from(businesses)
      .groupBy(businesses.subscriptionTier);

    return res.json({
      businesses: Number(bizCount[0].n),
      activeBusinesses: Number(activeBiz[0].n),
      users: Number(userCount[0].n),
      calls: Number(callCount[0].n),
      escalations: Number(escalationCount[0].n),
      planBreakdown: planCounts.map((r) => ({ tier: r.tier, count: Number(r.count) })),
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
    const { page, limit, search, tier, isActive } = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      search: z.string().optional(),
      tier: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']).optional(),
      isActive: z.coerce.boolean().optional(),
    }).parse(req.query);

    const conditions: any[] = [];
    if (search) conditions.push(ilike(businesses.name, `%${search}%`));
    if (tier) conditions.push(eq(businesses.subscriptionTier, tier));
    if (isActive !== undefined) conditions.push(eq(businesses.isActive, isActive));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(businesses).where(where).orderBy(desc(businesses.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(businesses).where(where),
    ]);

    const enriched = await Promise.all(rows.map(async (b) => {
      const [userCount, callCount] = await Promise.all([
        db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.businessId, b.id)),
        db.select({ n: sql<number>`count(*)` }).from(calls).where(eq(calls.businessId, b.id)),
      ]);
      return { ...b, _count: { users: Number(userCount[0].n), calls: Number(callCount[0].n) } };
    }));

    const total = Number(countResult[0].n);
    return res.json({ businesses: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
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

    const [members, recentCalls] = await Promise.all([
      db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role })
        .from(users).where(eq(users.businessId, req.params.id)),
      db.select().from(calls).where(eq(calls.businessId, req.params.id)).orderBy(desc(calls.startedAt)).limit(10),
    ]);

    return res.json({ ...biz, users: members, recentCalls });
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
    const schema = z.object({
      subscriptionTier: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']).optional(),
      isActive: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    const result = await db
      .update(businesses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businesses.id, req.params.id))
      .returning();
    if (!result.length) return res.status(404).json({ error: 'Business not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
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
      }).from(users).where(where).orderBy(desc(users.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(users).where(where),
    ]);

    const total = Number(countResult[0].n);
    return res.json({ users: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
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
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);

    const [rows, countResult] = await Promise.all([
      db.select().from(calls).orderBy(desc(calls.startedAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(calls),
    ]);

    const total = Number(countResult[0].n);
    return res.json({ calls: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
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
      })
      .from(businesses)
      .leftJoin(users, and(eq(users.businessId, businesses.id), eq(users.role, 'OWNER')))
      .orderBy(desc(businesses.createdAt))
      .limit(10);

    return res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      plan: r.plan,
      joinedAt: r.createdAt,
      owner: r.ownerFirstName
        ? `${r.ownerFirstName} ${r.ownerLastName ?? ''}`.trim()
        : (r.ownerEmail ?? 'Unknown'),
    })));
  } catch (err) { next(err); }
});

// ─── GET /admin/billing/overview ──────────────────────────────────────────────
adminRouter.get('/billing/overview', async (_req, res, next) => {
  try {
    const [totalBiz, planRows] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(businesses),
      db.select({ tier: businesses.subscriptionTier, count: sql<number>`count(*)` })
        .from(businesses).groupBy(businesses.subscriptionTier),
    ]);

    const planMap: Record<string, number> = {};
    for (const r of planRows) planMap[r.tier] = Number(r.count);

    const starterMrr = (planMap['STARTER'] ?? 0) * 15000;
    const growthMrr = (planMap['GROWTH'] ?? 0) * 45000;
    const mrr = starterMrr + growthMrr;

    return res.json({
      mrr,
      arr: mrr * 12,
      activeSubscriptions: Number(totalBiz[0].n),
      trialsCount: planMap['STARTER'] ?? 0,
      trialConversionRate: 0,
      planDistribution: [
        { name: 'Starter', value: planMap['STARTER'] ?? 0, color: '#6366f1' },
        { name: 'Growth', value: planMap['GROWTH'] ?? 0, color: '#22c55e' },
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
      plan: r.plan === 'STARTER' ? 'Starter' : r.plan === 'GROWTH' ? 'Growth' : 'Enterprise',
      status: r.isActive ? 'active' : 'cancelled',
      mrr: r.plan === 'STARTER' ? 15000 : r.plan === 'GROWTH' ? 45000 : 0,
      nextBillingAt: new Date(new Date(r.createdAt).setMonth(new Date(r.createdAt).getMonth() + 1)).toISOString(),
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
    trialDays: 14,
    webhookSecret: env.WHOP_WEBHOOK_SECRET ?? '',
    maintenanceMode: false,
  });
});

// ─── PATCH /admin/settings ────────────────────────────────────────────────────
adminRouter.patch('/settings', (_req, res) => {
  // Settings are env-based; acknowledge save without persisting
  return res.json({ message: 'Settings noted (restart required for env changes)' });
});

// ─── Phone number management ─────────────────────────────────────────────────

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
      provider: z.enum(['infobip', 'twilio', 'at']).default('infobip'),
      providerNumberId: z.string().optional(),
      isVirtual: z.boolean().default(true),
    }).parse(req.body);

    const [row] = await db.insert(phoneNumbers).values({
      ...body,
      businessId: req.params.id,
      verified: true,
    }).returning();
    return res.status(201).json(row);
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
