import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, ilike, and, sql } from 'drizzle-orm';
import { db, businesses, users, calls, escalations } from '../db';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin-guard';
import { sendTestEmail, sendVerificationEmail, sendPasswordResetEmail, sendTeamInviteEmail, sendSubscriptionConfirmEmail, sendSubscriptionCancelledEmail } from '../utils/email';

export const adminRouter = Router();
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
