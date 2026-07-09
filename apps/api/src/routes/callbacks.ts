import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, callbackRequests } from '../db';
import { authMiddleware } from '../middleware/auth';
import { notifyBusinessOwners } from '../services/notifications';
import { dispatchWebhook } from '../services/webhooks';
import { sendCallbackSms } from '../services/sms';
import { audit } from '../services/audit';

export const callbacksRouter: Router = Router();
callbacksRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Callbacks
 *     description: Customer callback requests
 */

/**
 * @openapi
 * /api/v1/callbacks:
 *   get:
 *     tags: [Callbacks]
 *     summary: List callback requests
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, SCHEDULED, COMPLETED, CANCELLED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated callback requests
 */
callbacksRouter.get('/', async (req, res, next) => {
  try {
    const { businessId: qBid, status, page, limit } = z.object({
      businessId: z.string().optional(),
      status: z.enum(['PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const conditions: any[] = [];
    if (bid) conditions.push(eq(callbackRequests.businessId, bid));
    if (status) conditions.push(eq(callbackRequests.status, status));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(callbackRequests).where(where).orderBy(desc(callbackRequests.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(callbackRequests).where(where),
    ]);
    return res.json({ callbacks: rows, total: Number(countResult[0].n), page, limit });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/callbacks:
 *   post:
 *     tags: [Callbacks]
 *     summary: Create a callback request
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessId, phoneNumber]
 *             properties:
 *               businessId: { type: string }
 *               phoneNumber: { type: string }
 *               customerName: { type: string }
 *               reason: { type: string }
 *               callId: { type: string }
 *               contactId: { type: string }
 *     responses:
 *       201:
 *         description: Callback request created
 */
callbacksRouter.post('/', async (req, res, next) => {
  try {
    const data = z.object({
      businessId: z.string(),
      phoneNumber: z.string(),
      customerName: z.string().optional(),
      reason: z.string().optional(),
      callId: z.string().optional(),
      contactId: z.string().optional(),
    }).parse(req.body);

    const [cb] = await db.insert(callbackRequests).values({
      businessId: data.businessId,
      phoneNumber: data.phoneNumber,
      customerName: data.customerName,
      reason: data.reason,
      callId: data.callId,
      contactId: data.contactId,
    }).returning();

    await notifyBusinessOwners(data.businessId, 'Callback Requested', `${data.customerName ?? data.phoneNumber} requested a callback${data.reason ? `: ${data.reason}` : ''}`);
    await dispatchWebhook(data.businessId, 'callback.requested', { callbackId: cb.id, phoneNumber: data.phoneNumber });
    await sendCallbackSms(data.phoneNumber, data.businessId).catch(() => null);
    await audit(req, 'callback.created', 'callback', cb.id);

    return res.status(201).json(cb);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/callbacks/{id}:
 *   patch:
 *     tags: [Callbacks]
 *     summary: Update callback status or assign to team member
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
 *               status: { type: string, enum: [PENDING, SCHEDULED, COMPLETED, CANCELLED] }
 *               assignedTo: { type: string, description: "User ID" }
 *               scheduledAt: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Updated callback
 */
callbacksRouter.patch('/:id', async (req, res, next) => {
  try {
    const data = z.object({
      status: z.enum(['PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
      assignedTo: z.string().optional(),
      scheduledAt: z.string().transform((v) => new Date(v)).optional(),
    }).parse(req.body);

    const update: any = { ...data };
    if (data.status === 'COMPLETED') update.completedAt = new Date();

    const [cb] = await db.update(callbackRequests).set(update)
      .where(eq(callbackRequests.id, req.params.id)).returning();
    if (!cb) return res.status(404).json({ error: 'Callback not found' });

    return res.json(cb);
  } catch (err) { next(err); }
});
