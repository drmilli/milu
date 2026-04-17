import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { randomBytes, createHmac } from 'crypto';
import { db, webhookConfigs } from '../db';
import { authMiddleware } from '../middleware/auth';
import { audit } from '../services/audit';

export const webhookConfigRouter = Router();
webhookConfigRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Webhooks
 *     description: Webhook endpoint configuration
 */

/**
 * @openapi
 * /api/v1/webhooks/configs:
 *   get:
 *     tags: [Webhooks]
 *     summary: List webhook configurations
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of webhook configs
 */
webhookConfigRouter.get('/', async (req, res, next) => {
  try {
    const { businessId: qBid } = z.object({
      businessId: z.string().optional(),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    if (!bid) return res.status(400).json({ error: 'businessId required' });

    const rows = await db.select().from(webhookConfigs).where(eq(webhookConfigs.businessId, bid));
    return res.json(rows.map((r) => ({ ...r, secret: `${r.secret.slice(0, 8)}...` })));
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/webhooks/configs:
 *   post:
 *     tags: [Webhooks]
 *     summary: Create a webhook configuration
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessId, url, events]
 *             properties:
 *               businessId: { type: string }
 *               url: { type: string, format: uri }
 *               events:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["order.created", "call.completed"]
 *     responses:
 *       201:
 *         description: Created webhook config (includes full secret — save it now)
 */
webhookConfigRouter.post('/', async (req, res, next) => {
  try {
    const data = z.object({
      businessId: z.string(),
      url: z.string().url(),
      events: z.array(z.string()).min(1),
    }).parse(req.body);

    const secret = randomBytes(32).toString('hex');
    const [cfg] = await db.insert(webhookConfigs)
      .values({ ...data, secret, isActive: true })
      .returning();

    await audit(req, 'webhook.created', 'webhook_config', cfg.id);
    return res.status(201).json(cfg);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/webhooks/configs/{id}:
 *   patch:
 *     tags: [Webhooks]
 *     summary: Update webhook configuration
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
 *               url: { type: string, format: uri }
 *               events: { type: array, items: { type: string } }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated webhook config
 */
webhookConfigRouter.patch('/:id', async (req, res, next) => {
  try {
    const data = z.object({
      url: z.string().url().optional(),
      events: z.array(z.string()).min(1).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);

    const [cfg] = await db.update(webhookConfigs).set(data)
      .where(eq(webhookConfigs.id, req.params.id)).returning();
    if (!cfg) return res.status(404).json({ error: 'Webhook config not found' });

    await audit(req, 'webhook.updated', 'webhook_config', cfg.id);
    return res.json({ ...cfg, secret: `${cfg.secret.slice(0, 8)}...` });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/webhooks/configs/{id}/rotate-secret:
 *   post:
 *     tags: [Webhooks]
 *     summary: Rotate webhook signing secret
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: New secret (save it now — shown once)
 */
webhookConfigRouter.post('/:id/rotate-secret', async (req, res, next) => {
  try {
    const secret = randomBytes(32).toString('hex');
    const [cfg] = await db.update(webhookConfigs).set({ secret })
      .where(eq(webhookConfigs.id, req.params.id)).returning();
    if (!cfg) return res.status(404).json({ error: 'Webhook config not found' });

    await audit(req, 'webhook.secret_rotated', 'webhook_config', cfg.id);
    return res.json({ id: cfg.id, secret });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/webhooks/configs/{id}:
 *   delete:
 *     tags: [Webhooks]
 *     summary: Delete webhook configuration
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
webhookConfigRouter.delete('/:id', async (req, res, next) => {
  try {
    const [cfg] = await db.delete(webhookConfigs)
      .where(eq(webhookConfigs.id, req.params.id)).returning();
    if (!cfg) return res.status(404).json({ error: 'Webhook config not found' });

    await audit(req, 'webhook.deleted', 'webhook_config', cfg.id);
    return res.status(204).send();
  } catch (err) { next(err); }
});
