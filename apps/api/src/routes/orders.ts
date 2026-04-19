import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, orders, contacts, businesses } from '../db';
import { authMiddleware } from '../middleware/auth';
import { notifyBusinessOwners } from '../services/notifications';
import { dispatchWebhook } from '../services/webhooks';
import { sendOrderConfirmation } from '../services/whatsapp';
import { sendOrderSms } from '../services/sms';
import { audit } from '../services/audit';

export const ordersRouter: Router = Router();
ordersRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Orders
 *     description: Order management
 */

/**
 * @openapi
 * /api/v1/orders:
 *   get:
 *     tags: [Orders]
 *     summary: List orders with filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, CONFIRMED, PROCESSING, COMPLETED, CANCELLED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated orders
 */
ordersRouter.get('/', async (req, res, next) => {
  try {
    const { businessId: qBid, status, page, limit } = z.object({
      businessId: z.string().optional(),
      status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const conditions: any[] = [];
    if (bid) conditions.push(eq(orders.businessId, bid));
    if (status) conditions.push(eq(orders.status, status));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(orders).where(where),
    ]);
    return res.json({ orders: rows, total: Number(countResult[0].n), page, limit });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create an order
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessId, customerPhone]
 *             properties:
 *               businessId: { type: string }
 *               customerPhone: { type: string }
 *               customerName: { type: string }
 *               contactId: { type: string }
 *               callId: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string }
 *                     qty: { type: integer }
 *                     price: { type: number }
 *               totalAmount: { type: integer }
 *               currency: { type: string, default: NGN }
 *               deliveryAddress: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Order created
 */
ordersRouter.post('/', async (req, res, next) => {
  try {
    const data = z.object({
      businessId: z.string(),
      customerPhone: z.string(),
      customerName: z.string().optional(),
      contactId: z.string().optional(),
      callId: z.string().optional(),
      items: z.array(z.object({ name: z.string(), qty: z.number(), price: z.number() })).default([]),
      totalAmount: z.number().int().optional(),
      currency: z.string().default('NGN'),
      deliveryAddress: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const [order] = await db.insert(orders).values({ ...data, orderNumber }).returning();

    await audit(req, 'order.created', 'order', order.id);
    await notifyBusinessOwners(data.businessId, 'New Order', `Order #${orderNumber} from ${data.customerName ?? data.customerPhone}`);
    await dispatchWebhook(data.businessId, 'order.created', { orderId: order.id, orderNumber, customerPhone: data.customerPhone });

    if (data.customerPhone) {
      const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, data.businessId)).limit(1);
      const businessName = biz?.name ?? 'your provider';
      await sendOrderSms(data.customerPhone, orderNumber).catch(() => null);
      await sendOrderConfirmation(data.customerPhone, orderNumber, data.items, businessName).catch(() => null);
    }

    return res.status(201).json(order);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order details
 */
ordersRouter.get('/:id', async (req, res, next) => {
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json(order);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/orders/{id}:
 *   patch:
 *     tags: [Orders]
 *     summary: Update order status or details
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
 *               status: { type: string, enum: [PENDING, CONFIRMED, PROCESSING, COMPLETED, CANCELLED] }
 *               notes: { type: string }
 *               deliveryAddress: { type: string }
 *     responses:
 *       200:
 *         description: Updated order
 */
ordersRouter.patch('/:id', async (req, res, next) => {
  try {
    const data = z.object({
      status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']).optional(),
      notes: z.string().optional(),
      deliveryAddress: z.string().optional(),
    }).parse(req.body);

    const [order] = await db.update(orders).set({ ...data, updatedAt: new Date() })
      .where(eq(orders.id, req.params.id)).returning();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await audit(req, 'order.updated', 'order', order.id, { status: data.status });
    if (data.status) {
      await dispatchWebhook(order.businessId, 'order.status_changed', { orderId: order.id, status: data.status });
    }
    return res.json(order);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/orders/{id}:
 *   delete:
 *     tags: [Orders]
 *     summary: Delete an order
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Deleted
 */
ordersRouter.delete('/:id', async (req, res, next) => {
  try {
    await db.delete(orders).where(eq(orders.id, req.params.id));
    return res.status(204).send();
  } catch (err) { next(err); }
});
