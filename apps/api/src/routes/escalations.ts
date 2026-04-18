import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, escalations } from '../db';
import { authMiddleware } from '../middleware/auth';
import { notifyBusinessOwners } from '../services/notifications';
import { sendEscalationAlert } from '../services/whatsapp';
import { audit } from '../services/audit';

export const escalationsRouter: Router = Router();
escalationsRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Escalations
 *     description: Call escalations — track, assign and resolve
 */

/**
 * @openapi
 * /api/v1/escalations:
 *   get:
 *     tags: [Escalations]
 *     summary: List escalations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, ASSIGNED, RESOLVED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated escalations
 */
escalationsRouter.get('/', async (req, res, next) => {
  try {
    const { businessId: qBid, status, page, limit } = z.object({
      businessId: z.string().optional(),
      status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const conditions: any[] = [];
    if (bid) conditions.push(eq(escalations.businessId, bid));
    if (status) conditions.push(eq(escalations.status, status));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(escalations).where(where).orderBy(desc(escalations.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(escalations).where(where),
    ]);
    return res.json({ escalations: rows, total: Number(countResult[0].n), page, limit });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/escalations/{id}:
 *   get:
 *     tags: [Escalations]
 *     summary: Get escalation details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Escalation details
 */
escalationsRouter.get('/:id', async (req, res, next) => {
  try {
    const [esc] = await db.select().from(escalations).where(eq(escalations.id, req.params.id)).limit(1);
    if (!esc) return res.status(404).json({ error: 'Escalation not found' });
    return res.json(esc);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/escalations/{id}:
 *   patch:
 *     tags: [Escalations]
 *     summary: Update escalation — assign or resolve
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
 *               status: { type: string, enum: [OPEN, ASSIGNED, RESOLVED] }
 *               assignedTo: { type: string, description: "User ID" }
 *     responses:
 *       200:
 *         description: Updated escalation
 */
escalationsRouter.patch('/:id', async (req, res, next) => {
  try {
    const data = z.object({
      status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED']).optional(),
      assignedTo: z.string().optional(),
    }).parse(req.body);

    const update: any = { ...data };
    if (data.status === 'RESOLVED') update.resolvedAt = new Date();

    const [esc] = await db.update(escalations).set(update)
      .where(eq(escalations.id, req.params.id)).returning();
    if (!esc) return res.status(404).json({ error: 'Escalation not found' });

    await audit(req, 'escalation.updated', 'escalation', esc.id, { status: data.status });
    return res.json(esc);
  } catch (err) { next(err); }
});
