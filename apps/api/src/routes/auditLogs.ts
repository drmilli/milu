import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db, auditLogs } from '../db';
import { authMiddleware } from '../middleware/auth';

export const auditLogsRouter = Router();
auditLogsRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Audit Logs
 *     description: Immutable activity trail for compliance and debugging
 */

/**
 * @openapi
 * /api/v1/audit-logs:
 *   get:
 *     tags: [Audit Logs]
 *     summary: List audit log entries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: resource
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated audit log entries
 */
auditLogsRouter.get('/', async (req, res, next) => {
  try {
    const { businessId: qBid, action, resource, userId, from, to, page, limit } = z.object({
      businessId: z.string().optional(),
      action: z.string().optional(),
      resource: z.string().optional(),
      userId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(50),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const conditions: any[] = [];
    if (bid) conditions.push(eq(auditLogs.businessId, bid));
    if (action) conditions.push(eq(auditLogs.action, action));
    if (resource) conditions.push(eq(auditLogs.resource, resource));
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (from) conditions.push(gte(auditLogs.createdAt, new Date(from)));
    if (to) conditions.push(lte(auditLogs.createdAt, new Date(to)));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(auditLogs).where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(where),
    ]);

    return res.json({ logs: rows, total: Number(countResult[0].n), page, limit });
  } catch (err) { next(err); }
});
