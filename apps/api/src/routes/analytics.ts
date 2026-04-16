import { Router } from 'express';
import { prisma } from '@milu/db';
import { authMiddleware } from '../middleware/auth';

export const analyticsRouter = Router();

analyticsRouter.use(authMiddleware);

analyticsRouter.get('/summary', async (req, res, next) => {
  try {
    const businessId = req.user?.businessId;
    const where = businessId ? { businessId } : {};

    const [totalCalls, resolvedByAI, resolvedByHuman, escalations] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, resolution: 'AI' } }),
      prisma.call.count({ where: { ...where, resolution: 'HUMAN' } }),
      prisma.escalation.count({ where: businessId ? { call: { businessId } } : {} }),
    ]);

    return res.json({ totalCalls, resolvedByAI, resolvedByHuman, escalations });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/intents', async (req, res, next) => {
  try {
    const businessId = req.user?.businessId;
    const where = businessId ? { businessId } : {};

    const intents = await prisma.call.groupBy({
      by: ['intent'],
      where,
      _count: { intent: true },
      orderBy: { _count: { intent: 'desc' } },
    });

    return res.json(intents.map((r) => ({ intent: r.intent, count: r._count.intent })));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get('/resolution-rate', async (req, res, next) => {
  try {
    const businessId = req.user?.businessId;
    const where = businessId ? { businessId } : {};

    const total = await prisma.call.count({ where });
    const aiResolved = await prisma.call.count({ where: { ...where, resolution: 'AI' } });

    return res.json({
      total,
      aiResolved,
      humanResolved: total - aiResolved,
      aiRate: total > 0 ? ((aiResolved / total) * 100).toFixed(1) + '%' : '0%',
    });
  } catch (err) {
    next(err);
  }
});
