import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { db, notifications } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendNotification } from '../services/notifications';

export const notificationsRouter: Router = Router();
notificationsRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Notifications
 *     description: In-app, email, SMS, and WhatsApp notifications
 */

/**
 * @openapi
 * /api/v1/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List notifications for current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean }
 *       - in: query
 *         name: channel
 *         schema: { type: string, enum: [IN_APP, EMAIL, SMS, WHATSAPP] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 30 }
 *     responses:
 *       200:
 *         description: Paginated notifications
 */
notificationsRouter.get('/', async (req, res, next) => {
  try {
    const { unreadOnly, channel, page, limit } = z.object({
      unreadOnly: z.coerce.boolean().default(false),
      channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP']).optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(30),
    }).parse(req.query);

    const conditions: any[] = [eq(notifications.userId, req.user!.userId)];
    if (unreadOnly) conditions.push(isNull(notifications.readAt));
    if (channel) conditions.push(eq(notifications.channel, channel));

    const where = and(...conditions);
    const [rows, countResult, unreadCount] = await Promise.all([
      db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(notifications).where(where),
      db.select({ n: sql<number>`count(*)` }).from(notifications)
        .where(and(eq(notifications.userId, req.user!.userId), isNull(notifications.readAt))),
    ]);

    return res.json({
      notifications: rows,
      total: Number(countResult[0].n),
      unread: Number(unreadCount[0].n),
      page,
      limit,
    });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Marked as read
 */
notificationsRouter.patch('/:id/read', async (req, res, next) => {
  try {
    await db.update(notifications)
      .set({ readAt: new Date(), status: 'READ' })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.user!.userId)));
    return res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All marked as read
 */
notificationsRouter.patch('/read-all', async (req, res, next) => {
  try {
    await db.update(notifications)
      .set({ readAt: new Date(), status: 'READ' })
      .where(and(eq(notifications.userId, req.user!.userId), isNull(notifications.readAt)));
    return res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/notifications/send:
 *   post:
 *     tags: [Notifications]
 *     summary: Send a custom notification
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [channel, title, body]
 *             properties:
 *               channel: { type: string, enum: [IN_APP, EMAIL, SMS, WHATSAPP] }
 *               title: { type: string }
 *               body: { type: string }
 *               recipient: { type: string, description: "Phone or email depending on channel" }
 *               userId: { type: string }
 *               businessId: { type: string }
 *     responses:
 *       200:
 *         description: Notification queued
 */
notificationsRouter.post('/send', async (req, res, next) => {
  try {
    const data = z.object({
      channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP']),
      title: z.string(),
      body: z.string(),
      recipient: z.string().optional(),
      userId: z.string().optional(),
      businessId: z.string().optional(),
    }).parse(req.body);

    await sendNotification({
      channel: data.channel,
      title: data.title,
      body: data.body,
      recipient: data.recipient,
      businessId: data.businessId ?? req.user?.businessId,
      userId: data.userId ?? req.user?.userId,
    });

    return res.json({ success: true });
  } catch (err) { next(err); }
});
