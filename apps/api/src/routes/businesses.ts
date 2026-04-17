import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, businesses, knowledgeBases, phoneNumbers, users, phoneVerifications } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendCustomSms } from '../services/sms';
import { audit } from '../services/audit';

export const businessesRouter = Router();
businessesRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Businesses
 *     description: Business profile and configuration
 */

/**
 * @openapi
 * /api/v1/businesses/{id}:
 *   get:
 *     tags: [Businesses]
 *     summary: Get business details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Business details
 *       404:
 *         description: Not found
 */
businessesRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await db.select().from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    if (!result.length) return res.status(404).json({ error: 'Business not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}:
 *   put:
 *     tags: [Businesses]
 *     summary: Update business details
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
 *               name: { type: string }
 *               industry: { type: string }
 *     responses:
 *       200:
 *         description: Updated business
 */
businessesRouter.put('/:id', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      industry: z.string().optional(),
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
 * /api/v1/businesses/{id}/kb:
 *   get:
 *     tags: [Businesses]
 *     summary: Get knowledge base
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Knowledge base data
 */
businessesRouter.get('/:id/kb', async (req, res, next) => {
  try {
    const result = await db.select().from(knowledgeBases).where(eq(knowledgeBases.businessId, req.params.id)).limit(1);
    if (!result.length) return res.status(404).json({ error: 'Knowledge base not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/kb:
 *   put:
 *     tags: [Businesses]
 *     summary: Update knowledge base
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
 *               businessName: { type: string }
 *               operatingHours: { type: object }
 *               faqs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     question: { type: string }
 *                     answer: { type: string }
 *               escalationNumber: { type: string }
 *               voiceId: { type: string }
 *     responses:
 *       200:
 *         description: Updated knowledge base
 */
businessesRouter.put('/:id/kb', async (req, res, next) => {
  try {
    const schema = z.object({
      businessName: z.string().optional(),
      operatingHours: z.record(z.string()).optional(),
      faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
      escalationNumber: z.string().optional(),
      voiceId: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const result = await db
      .update(knowledgeBases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(knowledgeBases.businessId, req.params.id))
      .returning();
    if (!result.length) return res.status(404).json({ error: 'Knowledge base not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/phone-numbers:
 *   get:
 *     tags: [Businesses]
 *     summary: List phone numbers for a business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of phone numbers
 */
businessesRouter.get('/:id/phone-numbers', async (req, res, next) => {
  try {
    const numbers = await db.select().from(phoneNumbers).where(eq(phoneNumbers.businessId, req.params.id));
    return res.json(numbers);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/phone-numbers/send-otp:
 *   post:
 *     tags: [Businesses]
 *     summary: Send a verification OTP to a phone number before adding it
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
 *             required: [number]
 *             properties:
 *               number: { type: string, example: "+2348012345678" }
 *     responses:
 *       200:
 *         description: OTP sent via SMS
 *       409:
 *         description: Number already registered
 */
businessesRouter.post('/:id/phone-numbers/send-otp', async (req, res, next) => {
  try {
    const { number } = z.object({ number: z.string().min(7) }).parse(req.body);

    // Check not already taken
    const existing = await db.select({ id: phoneNumbers.id })
      .from(phoneNumbers).where(eq(phoneNumbers.number, number)).limit(1);
    if (existing.length) return res.status(409).json({ error: 'Phone number already registered' });

    // Expire previous pending OTPs for this business+number
    await db.delete(phoneVerifications).where(
      and(
        eq(phoneVerifications.businessId, req.params.id),
        eq(phoneVerifications.phone, number),
        eq(phoneVerifications.used, false),
      ),
    );

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(phoneVerifications).values({
      businessId: req.params.id,
      phone: number,
      code,
      expiresAt,
    });

    await sendCustomSms(
      number,
      `Your Milu verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
    );

    return res.json({ message: 'OTP sent', number });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/phone-numbers/verify:
 *   post:
 *     tags: [Businesses]
 *     summary: Confirm OTP and register the phone number
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
 *             required: [number, code]
 *             properties:
 *               number: { type: string }
 *               code: { type: string }
 *               label: { type: string, description: "Optional friendly label" }
 *     responses:
 *       201:
 *         description: Phone number verified and added
 *       400:
 *         description: Invalid or expired code
 */
businessesRouter.post('/:id/phone-numbers/verify', async (req, res, next) => {
  try {
    const { number, code, label } = z.object({
      number: z.string().min(7),
      code: z.string().length(6),
      label: z.string().optional(),
    }).parse(req.body);

    const [record] = await db.select().from(phoneVerifications).where(
      and(
        eq(phoneVerifications.businessId, req.params.id),
        eq(phoneVerifications.phone, number),
        eq(phoneVerifications.code, code),
        eq(phoneVerifications.used, false),
      ),
    ).limit(1);

    if (!record) return res.status(400).json({ error: 'Invalid code' });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'Code expired. Please request a new one.' });

    await db.update(phoneVerifications).set({ used: true }).where(eq(phoneVerifications.id, record.id));

    let phone;
    try {
      [phone] = await db.insert(phoneNumbers)
        .values({ number, businessId: req.params.id, verified: true, label: label ?? null })
        .returning();
    } catch {
      return res.status(409).json({ error: 'Phone number already registered' });
    }

    await audit(req, 'phone_number.added', 'phone_number', phone.id, { number });
    return res.status(201).json(phone);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/phone-numbers/{numberId}:
 *   delete:
 *     tags: [Businesses]
 *     summary: Remove a phone number
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: numberId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Deleted
 */
businessesRouter.delete('/:id/phone-numbers/:numberId', async (req, res, next) => {
  try {
    await db.delete(phoneNumbers).where(
      and(eq(phoneNumbers.id, req.params.numberId), eq(phoneNumbers.businessId, req.params.id))
    );
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/team:
 *   get:
 *     tags: [Businesses]
 *     summary: List team members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Team members list
 */
businessesRouter.get('/:id/team', async (req, res, next) => {
  try {
    const members = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.businessId, req.params.id));
    return res.json(members);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/team/{userId}:
 *   delete:
 *     tags: [Businesses]
 *     summary: Remove a team member
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Removed
 */
businessesRouter.delete('/:id/team/:userId', async (req, res, next) => {
  try {
    await db.update(users)
      .set({ businessId: null })
      .where(and(eq(users.id, req.params.userId), eq(users.businessId, req.params.id)));
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});
