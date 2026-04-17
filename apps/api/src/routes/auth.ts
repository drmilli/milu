import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, users, businesses, knowledgeBases } from '../db';
import { signToken, verifyToken } from '../utils/jwt';
import { authLimiter } from '../middleware/rate-limit';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';

export const authRouter = Router();

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Authentication and account management
 */

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new business account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, businessName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               businessName: { type: string }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *     responses:
 *       201:
 *         description: Account created — email verification sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 businessId: { type: string }
 *       409:
 *         description: Email already registered
 */
authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      businessName: z.string().min(1),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    });
    const { email, password, businessName, firstName, lastName } = schema.parse(req.body);

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const verificationToken = String(Math.floor(100000 + Math.random() * 900000));

    const businessId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    await db.insert(businesses).values({ id: businessId, name: businessName });
    await db.insert(knowledgeBases).values({ businessId, businessName });
    await db.insert(users).values({
      id: userId,
      email,
      password: hashed,
      firstName,
      lastName,
      role: 'OWNER',
      businessId,
      emailVerified: false,
      verificationToken,
    });

    sendVerificationEmail(email, verificationToken).catch(() => null);

    const token = signToken({ userId, businessId, role: 'OWNER' });
    return res.status(201).json({ token, businessId, message: 'Verification email sent' });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email address with 6-digit code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, minLength: 6, maxLength: 6 }
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired code
 */
authRouter.post('/verify-email', async (req, res, next) => {
  try {
    const { email, code } = z.object({
      email: z.string().email(),
      code: z.string().length(6),
    }).parse(req.body);

    const [user] = await db
      .select({ id: users.id, verificationToken: users.verificationToken })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || user.verificationToken !== code) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    await db
      .update(users)
      .set({ emailVerified: true, verificationToken: null })
      .where(eq(users.id, user.id));

    return res.json({ success: true, message: 'Email verified' });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Email sent if account exists
 */
authRouter.post('/resend-verification', authLimiter, async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user.length && !user[0].emailVerified) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db.update(users).set({ verificationToken: code }).where(eq(users.email, email));
      sendVerificationEmail(email, code).catch(() => null);
    }
    return res.json({ message: 'If that email exists, a verification code was sent' });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     email: { type: string }
 *                     role: { type: string }
 *                     businessId: { type: string }
 *                     emailVerified: { type: boolean }
 *       401:
 *         description: Invalid credentials
 */
authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = result[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ userId: user.id, businessId: user.businessId ?? undefined, role: user.role });
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        businessId: user.businessId,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh JWT token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: New token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *       401:
 *         description: Invalid or missing token
 */
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
    const payload = verifyToken(header.slice(7));
    const token = signToken({ userId: payload.userId, businessId: payload.businessId, role: payload.role });
    return res.json({ token });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Reset email sent if account exists
 */
authRouter.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const result = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (result.length) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.update(users).set({ resetToken: token, resetTokenExpiry: expiry }).where(eq(users.email, email));
      sendPasswordResetEmail(email, token).catch(() => null);
    }
    return res.json({ message: 'If that email exists, a reset link was sent' });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = z.object({
      token: z.string(),
      password: z.string().min(8),
    }).parse(req.body);

    const result = await db.select().from(users).where(eq(users.resetToken, token)).limit(1);
    const user = result[0];
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await db.update(users)
      .set({ password: hashed, resetToken: null, resetTokenExpiry: null })
      .where(eq(users.id, user.id));

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout (client should discard token)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
authRouter.post('/logout', (_req, res) => {
  res.json({ success: true });
});

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user details
 *       401:
 *         description: Unauthorized
 */
authRouter.get('/me', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
    const payload = verifyToken(header.slice(7));
    const result = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      businessId: users.businessId,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, payload.userId)).limit(1);

    if (!result.length) return res.status(404).json({ error: 'User not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});
