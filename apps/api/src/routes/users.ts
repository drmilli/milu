import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { db, users, businesses } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendTeamInviteEmail } from '../utils/email';

export const usersRouter: Router = Router();
usersRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: Team member management
 */

/**
 * @openapi
 * /api/v1/users/invite:
 *   post:
 *     tags: [Users]
 *     summary: Invite a team member (creates account with temp password)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, businessId]
 *             properties:
 *               email: { type: string, format: email }
 *               businessId: { type: string }
 *               role: { type: string, enum: [OWNER, ADMIN], default: ADMIN }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       201:
 *         description: Invited successfully
 *       409:
 *         description: Email already registered
 */
usersRouter.post('/invite', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      businessId: z.string(),
      role: z.enum(['OWNER', 'ADMIN']).default('ADMIN'),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    });
    const { email, businessId, role, firstName, lastName } = schema.parse(req.body);

    if (req.user?.role === 'OWNER' && req.plan?.tier === 'ONE_TIME') {
      return res.status(402).json({ error: 'Upgrade to add team members.' });
    }

    if (req.user?.role === 'OWNER' && req.user.businessId && req.user.businessId !== businessId) {
      return res.status(403).json({ error: 'You can only invite members to your own business.' });
    }

    if (req.user?.role === 'OWNER' && req.plan?.limits.teamMembers != null) {
      const [count] = await db
        .select({ n: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.businessId, businessId));
      const used = Number(count?.n ?? 0);
      if (used >= req.plan.limits.teamMembers) {
        return res.status(402).json({ error: 'Upgrade to Growth to add more team members.' });
      }
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);

    const result = await db.insert(users).values({
      email,
      password: hashed,
      role,
      businessId,
      firstName,
      lastName,
      emailVerified: true,
    }).returning({
      id: users.id,
      email: users.email,
      role: users.role,
    });

    const biz = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    const businessName = biz[0]?.name ?? 'your team';
    await sendTeamInviteEmail(email, businessName, tempPassword);
    return res.status(201).json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: Not found
 */
usersRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      businessId: users.businessId,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, req.params.id)).limit(1);

    if (!result.length) return res.status(404).json({ error: 'User not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update user profile
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
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               role: { type: string, enum: [OWNER, ADMIN] }
 *     responses:
 *       200:
 *         description: Updated user
 */
usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const schema = z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      role: z.enum(['OWNER', 'ADMIN']).optional(),
    });
    const data = schema.parse(req.body);
    const result = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, req.params.id))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      });

    if (!result.length) return res.status(404).json({ error: 'User not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/users/{id}/reset-password:
 *   post:
 *     tags: [Users]
 *     summary: Admin resets a team member's password
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password updated
 */
usersRouter.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { password } = z.object({ password: z.string().min(8) }).parse(req.body);
    const hashed = await bcrypt.hash(password, 10);
    await db.update(users)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(users.id, req.params.id));
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/users/{id}/change-password:
 *   post:
 *     tags: [Users]
 *     summary: User changes their own password
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password changed
 *       401:
 *         description: Current password incorrect
 */
usersRouter.post('/:id/change-password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }).parse(req.body);

    const result = await db.select({ id: users.id, password: users.password }).from(users).where(eq(users.id, req.params.id)).limit(1);
    if (!result.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, result[0].password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ password: hashed, updatedAt: new Date() }).where(eq(users.id, req.params.id));
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
