import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db, calls, escalations, businesses } from '../db';
import { authMiddleware } from '../middleware/auth';

export const analyticsRouter: Router = Router();
analyticsRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Analytics
 *     description: Business and platform analytics
 */

function dateRange(from?: string, to?: string) {
  const conditions = [];
  if (from) conditions.push(gte(calls.startedAt, new Date(from)));
  if (to) conditions.push(lte(calls.startedAt, new Date(to)));
  return conditions;
}

/**
 * @openapi
 * /api/v1/analytics/summary:
 *   get:
 *     tags: [Analytics]
 *     summary: Get overall call summary stats
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Summary stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCalls: { type: integer }
 *                 resolvedByAI: { type: integer }
 *                 resolvedByHuman: { type: integer }
 *                 abandoned: { type: integer }
 *                 escalations: { type: integer }
 *                 aiResolutionRate: { type: string }
 */
analyticsRouter.get('/summary', async (req, res, next) => {
  try {
    const { businessId: qBid, from, to } = z.object({
      businessId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const base = [
      ...(bid ? [eq(calls.businessId, bid)] : []),
      ...dateRange(from, to),
    ];
    const where = base.length ? and(...base as any) : undefined;

    const [total, aiResolved, humanResolved, abandoned, escalationCount] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(calls).where(where),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(and(...[...(base as any), eq(calls.resolution, 'AI')])),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(and(...[...(base as any), eq(calls.resolution, 'HUMAN')])),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(and(...[...(base as any), eq(calls.resolution, 'ABANDONED')])),
      db.select({ n: sql<number>`count(*)` }).from(escalations),
    ]);

    const t = Number(total[0].n);
    const ai = Number(aiResolved[0].n);
    return res.json({
      totalCalls: t,
      resolvedByAI: ai,
      resolvedByHuman: Number(humanResolved[0].n),
      abandoned: Number(abandoned[0].n),
      escalations: Number(escalationCount[0].n),
      aiResolutionRate: t > 0 ? ((ai / t) * 100).toFixed(1) + '%' : '0%',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/analytics/intents:
 *   get:
 *     tags: [Analytics]
 *     summary: Get call count grouped by intent
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Intent breakdown
 */
analyticsRouter.get('/intents', async (req, res, next) => {
  try {
    const { businessId: qBid } = z.object({ businessId: z.string().optional() }).parse(req.query);
    const bid = req.user?.businessId ?? qBid;
    const where = bid ? eq(calls.businessId, bid) : undefined;

    const rows = await db
      .select({ intent: calls.intent, count: sql<number>`count(*)` })
      .from(calls)
      .where(where)
      .groupBy(calls.intent)
      .orderBy(sql`count(*) desc`);

    return res.json(rows.map((r) => ({ intent: r.intent ?? 'UNKNOWN', count: Number(r.count) })));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/analytics/resolution-rate:
 *   get:
 *     tags: [Analytics]
 *     summary: AI vs human resolution breakdown
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Resolution rate data
 */
analyticsRouter.get('/resolution-rate', async (req, res, next) => {
  try {
    const { businessId: qBid } = z.object({ businessId: z.string().optional() }).parse(req.query);
    const bid = req.user?.businessId ?? qBid;
    const where = bid ? eq(calls.businessId, bid) : undefined;

    const rows = await db
      .select({ resolution: calls.resolution, count: sql<number>`count(*)` })
      .from(calls)
      .where(where)
      .groupBy(calls.resolution);

    const total = rows.reduce((s, r) => s + Number(r.count), 0);
    const result = rows.map((r) => ({
      resolution: r.resolution ?? 'UNKNOWN',
      count: Number(r.count),
      percentage: total > 0 ? ((Number(r.count) / total) * 100).toFixed(1) + '%' : '0%',
    }));

    return res.json({ total, breakdown: result });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/analytics/daily-volume:
 *   get:
 *     tags: [Analytics]
 *     summary: Daily call volume for the last N days
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Daily volume array
 */
analyticsRouter.get('/daily-volume', async (req, res, next) => {
  try {
    const { businessId: qBid, days } = z.object({
      businessId: z.string().optional(),
      days: z.coerce.number().default(30),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const conditions: any[] = [gte(calls.startedAt, since)];
    if (bid) conditions.push(eq(calls.businessId, bid));

    const rows = await db
      .select({
        day: sql<string>`date_trunc('day', ${calls.startedAt})::date`,
        count: sql<number>`count(*)`,
      })
      .from(calls)
      .where(and(...conditions))
      .groupBy(sql`date_trunc('day', ${calls.startedAt})`)
      .orderBy(sql`date_trunc('day', ${calls.startedAt})`);

    return res.json(rows.map((r) => ({ day: r.day, count: Number(r.count) })));
  } catch (err) {
    next(err);
  }
});
