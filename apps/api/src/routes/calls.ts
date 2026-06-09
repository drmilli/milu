import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { db, calls, transcripts, escalations } from '../db';
import { authMiddleware } from '../middleware/auth';
import { env } from '../config/env';

export const callsRouter: Router = Router();
callsRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Calls
 *     description: Call logs and transcripts
 */

/**
 * @openapi
 * /api/v1/calls:
 *   get:
 *     tags: [Calls]
 *     summary: List calls with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, COMPLETED, FAILED] }
 *       - in: query
 *         name: resolution
 *         schema: { type: string, enum: [AI, HUMAN, ABANDONED] }
 *       - in: query
 *         name: intent
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated call list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 calls: { type: array, items: { type: object } }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
 */
callsRouter.get('/', async (req, res, next) => {
  try {
    const schema = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
      businessId: z.string().optional(),
      status: z.enum(['ACTIVE', 'COMPLETED', 'FAILED']).optional(),
      resolution: z.enum(['AI', 'HUMAN', 'ABANDONED']).optional(),
      intent: z.string().optional(), // free-text search on callerNumber/name/location
    });
    const { page, limit, businessId, status, resolution, intent } = schema.parse(req.query);
    const like = intent ? `%${intent}%` : null;

    const scopedBusinessId = req.user?.role === 'OWNER' ? req.user.businessId : businessId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = [
      ...(scopedBusinessId ? [eq(calls.businessId, scopedBusinessId)] : []),
      ...(status ? [eq(calls.status, status)] : []),
      ...(resolution ? [eq(calls.resolution, resolution)] : []),
      ...(like ? [or(
        ilike(calls.callerNumber, like),
        sql`${calls.callerName} ILIKE ${like}`,
        sql`${calls.callerLocation} ILIKE ${like}`,
      )] : []),
    ];

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(calls).where(where).orderBy(desc(calls.startedAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(calls).where(where),
    ]);

    const total = Number(countResult[0]?.n ?? 0);
    // Map duration → durationSeconds for frontend
    const mapped = rows.map(c => ({ ...c, durationSeconds: c.duration }));
    return res.json({ calls: mapped, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/calls/{id}:
 *   get:
 *     tags: [Calls]
 *     summary: Get a single call with transcript and escalation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Call details with transcript
 *       404:
 *         description: Not found
 */
callsRouter.get('/:id', async (req, res, next) => {
  try {
    const [call] = await db.select().from(calls).where(eq(calls.id, req.params.id)).limit(1);
    if (!call) return res.status(404).json({ error: 'Call not found' });

    const [callTranscripts, escalation] = await Promise.all([
      db.select().from(transcripts).where(eq(transcripts.callId, req.params.id)),
      db.select().from(escalations).where(eq(escalations.callId, req.params.id)).limit(1),
    ]);

    return res.json({ ...call, transcripts: callTranscripts, escalation: escalation[0] ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/calls/{id}/transcript:
 *   get:
 *     tags: [Calls]
 *     summary: Get call transcript
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transcript entries ordered by time
 */
callsRouter.get('/:id/transcript', async (req, res, next) => {
  try {
    const rows = await db.select().from(transcripts).where(eq(transcripts.callId, req.params.id)).orderBy(transcripts.createdAt);
    // Map speaker/text → role/content for frontend
    return res.json(rows.map(r => ({ id: r.id, role: r.speaker, content: r.text, createdAt: r.createdAt })));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/calls/{id}/recording:
 *   get:
 *     tags: [Calls]
 *     summary: Get call recording URL
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Recording URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string }
 *       404:
 *         description: No recording available
 */
callsRouter.get('/:id/recording', async (req, res, next) => {
  try {
    if (req.user?.role === 'OWNER' && req.plan && !req.plan.features.callRecording) {
      return res.status(402).json({ error: 'Upgrade to Growth to access call recordings.' });
    }
    const [call] = await db.select({ recordingUrl: calls.recordingUrl }).from(calls).where(eq(calls.id, req.params.id)).limit(1);
    if (!call?.recordingUrl) return res.status(404).json({ error: 'No recording found' });
    return res.json({ url: call.recordingUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/calls/{id}/recording/stream:
 *   get:
 *     tags: [Calls]
 *     summary: Stream a call recording (proxies Twilio recordings that require auth)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Audio stream
 *       404:
 *         description: No recording available
 */
callsRouter.get('/:id/recording/stream', async (req, res, next) => {
  try {
    if (req.user?.role === 'OWNER' && req.plan && !req.plan.features.callRecording) {
      return res.status(402).json({ error: 'Upgrade to Growth to access call recordings.' });
    }
    const [call] = await db.select({ recordingUrl: calls.recordingUrl, businessId: calls.businessId })
      .from(calls).where(eq(calls.id, req.params.id)).limit(1);
    if (!call?.recordingUrl) return res.status(404).json({ error: 'No recording found' });

    // If the stored URL is already a public CDN URL (Cloudinary, etc.) just redirect
    if (!call.recordingUrl.includes('api.twilio.com')) {
      return res.redirect(call.recordingUrl);
    }

    // Proxy Twilio recording with Basic Auth
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      return res.status(404).json({ error: 'Recording not accessible' });
    }

    const authHeader = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const upstream = await fetch(call.recordingUrl, {
      headers: { Authorization: `Basic ${authHeader}` },
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) return res.status(404).json({ error: 'Recording not found' });

    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'audio/mpeg');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    next(err);
  }
});
