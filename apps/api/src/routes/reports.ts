import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { db, calls, orders, appointments, escalations, contacts } from '../db';
import { authMiddleware } from '../middleware/auth';

export const reportsRouter: Router = Router();
reportsRouter.use(authMiddleware);

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

/**
 * @openapi
 * tags:
 *   - name: Reports
 *     description: Analytics summaries and CSV exports
 */

/**
 * @openapi
 * /api/v1/reports/calls/export:
 *   get:
 *     tags: [Reports]
 *     summary: Export calls as CSV
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
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 */
reportsRouter.get('/calls/export', async (req, res, next) => {
  try {
    const { businessId: qBid, from, to } = z.object({
      businessId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const conditions: any[] = [];
    if (bid) conditions.push(eq(calls.businessId, bid));
    if (from) conditions.push(gte(calls.startedAt, new Date(from)));
    if (to) conditions.push(lte(calls.startedAt, new Date(to)));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select().from(calls).where(where).orderBy(desc(calls.startedAt)).limit(10000);
    const headers = ['id', 'callerNumber', 'status', 'resolution', 'intent', 'duration', 'startedAt', 'endedAt'];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="calls-${Date.now()}.csv"`);
    return res.send(toCsv(headers, rows as any));
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/reports/orders/export:
 *   get:
 *     tags: [Reports]
 *     summary: Export orders as CSV
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
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema: { type: string }
 */
reportsRouter.get('/orders/export', async (req, res, next) => {
  try {
    const { businessId: qBid, from, to } = z.object({
      businessId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const conditions: any[] = [];
    if (bid) conditions.push(eq(orders.businessId, bid));
    if (from) conditions.push(gte(orders.createdAt, new Date(from)));
    if (to) conditions.push(lte(orders.createdAt, new Date(to)));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(10000);
    const headers = ['id', 'orderNumber', 'status', 'customerName', 'customerPhone', 'totalAmount', 'currency', 'createdAt'];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${Date.now()}.csv"`);
    return res.send(toCsv(headers, rows as any));
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/reports/summary:
 *   get:
 *     tags: [Reports]
 *     summary: Period summary — calls, orders, appointments, escalations
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
 *         description: Summary counts and revenue
 */
reportsRouter.get('/summary', async (req, res, next) => {
  try {
    const { businessId: qBid, from, to } = z.object({
      businessId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;

    const callConds: any[] = bid ? [eq(calls.businessId, bid)] : [];
    const orderConds: any[] = bid ? [eq(orders.businessId, bid)] : [];
    const apptConds: any[] = bid ? [eq(appointments.businessId, bid)] : [];
    const escConds: any[] = bid ? [eq(escalations.businessId, bid)] : [];

    if (from) {
      callConds.push(gte(calls.startedAt, new Date(from)));
      orderConds.push(gte(orders.createdAt, new Date(from)));
      apptConds.push(gte(appointments.scheduledAt, new Date(from)));
    }
    if (to) {
      callConds.push(lte(calls.startedAt, new Date(to)));
      orderConds.push(lte(orders.createdAt, new Date(to)));
    }

    const callWhere = callConds.length ? and(...callConds) : undefined;
    const orderWhere = orderConds.length ? and(...orderConds) : undefined;
    const apptWhere = apptConds.length ? and(...apptConds) : undefined;
    const escWhere = escConds.length ? and(...escConds) : undefined;

    const [callCount, orderCount, apptCount, escCount, revenue, contactCount] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(calls).where(callWhere),
      db.select({ n: sql<number>`count(*)` }).from(orders).where(orderWhere),
      db.select({ n: sql<number>`count(*)` }).from(appointments).where(apptWhere),
      db.select({ n: sql<number>`count(*)` }).from(escalations).where(escWhere),
      db.select({ total: sql<number>`coalesce(sum(total_amount), 0)` }).from(orders).where(orderWhere),
      bid ? db.select({ n: sql<number>`count(*)` }).from(contacts).where(eq(contacts.businessId, bid)) : Promise.resolve([{ n: 0 }]),
    ]);

    return res.json({
      period: { from, to },
      calls: Number(callCount[0].n),
      orders: Number(orderCount[0].n),
      appointments: Number(apptCount[0].n),
      escalations: Number(escCount[0].n),
      revenue: Number(revenue[0].total),
      contacts: Number(contactCount[0].n),
    });
  } catch (err) { next(err); }
});
