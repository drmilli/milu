import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';
import { db, apiKeys } from '../db';
import { authMiddleware } from '../middleware/auth';
import { audit } from '../services/audit';

export const apiKeysRouter: Router = Router();
apiKeysRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: API Keys
 *     description: Programmatic API access management
 */

/**
 * @openapi
 * /api/v1/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List API keys for a business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of API keys (secrets never returned after creation)
 */
apiKeysRouter.get('/', async (req, res, next) => {
  try {
    const { businessId: qBid } = z.object({
      businessId: z.string().optional(),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    if (!bid) return res.status(400).json({ error: 'businessId required' });

    const rows = await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(and(eq(apiKeys.businessId, bid), eq(apiKeys.isActive, true)));

    return res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Create a new API key
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessId, name]
 *             properties:
 *               businessId: { type: string }
 *               name: { type: string, description: "Human-readable label" }
 *               scopes:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["calls:read", "orders:write"]
 *               expiresAt: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Created key — plaintext shown once
 */
apiKeysRouter.post('/', async (req, res, next) => {
  try {
    const data = z.object({
      businessId: z.string(),
      name: z.string().min(1),
      scopes: z.array(z.string()).default([]),
      expiresAt: z.string().transform((v) => new Date(v)).optional(),
    }).parse(req.body);

    const raw = `milu_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const keyPrefix = raw.slice(0, 12);

    const [key] = await db.insert(apiKeys).values({
      businessId: data.businessId,
      name: data.name,
      keyHash,
      keyPrefix,
      scopes: data.scopes,
      expiresAt: data.expiresAt,
      isActive: true,
    }).returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    });

    await audit(req, 'api_key.created', 'api_key', key.id, { name: data.name });
    return res.status(201).json({ ...key, key: raw });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/api-keys/{id}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Revoke (soft-delete) an API key
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Revoked
 */
apiKeysRouter.delete('/:id', async (req, res, next) => {
  try {
    const [key] = await db.update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, req.params.id))
      .returning({ id: apiKeys.id, name: apiKeys.name });

    if (!key) return res.status(404).json({ error: 'API key not found' });

    await audit(req, 'api_key.revoked', 'api_key', key.id, { name: key.name });
    return res.status(204).send();
  } catch (err) { next(err); }
});
