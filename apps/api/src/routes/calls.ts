import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@milu/db';
import { authMiddleware } from '../middleware/auth';

export const callsRouter = Router();

callsRouter.use(authMiddleware);

callsRouter.get('/', async (req, res, next) => {
  try {
    const schema = z.object({
      page: z.coerce.number().default(1),
      limit: z.coerce.number().max(100).default(20),
      businessId: z.string().optional(),
      intent: z.string().optional(),
      resolution: z.string().optional(),
    });
    const { page, limit, businessId, intent, resolution } = schema.parse(req.query);

    const where = {
      ...(businessId && { businessId }),
      ...(intent && { intent: intent as any }),
      ...(resolution && { resolution: resolution as any }),
    };

    const [calls, total] = await Promise.all([
      prisma.call.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        include: { escalation: true },
      }),
      prisma.call.count({ where }),
    ]);

    return res.json({ calls, total, page, limit });
  } catch (err) {
    next(err);
  }
});

callsRouter.get('/:id', async (req, res, next) => {
  try {
    const call = await prisma.call.findUnique({
      where: { id: req.params.id },
      include: { transcripts: { orderBy: { createdAt: 'asc' } }, escalation: true },
    });
    if (!call) return res.status(404).json({ error: 'Not found' });
    return res.json(call);
  } catch (err) {
    next(err);
  }
});

callsRouter.get('/:id/recording', async (req, res, next) => {
  try {
    const call = await prisma.call.findUnique({ where: { id: req.params.id } });
    if (!call?.recordingUrl) return res.status(404).json({ error: 'No recording found' });
    return res.json({ url: call.recordingUrl });
  } catch (err) {
    next(err);
  }
});
