import { Router } from 'express';
import { prisma } from '@milu/db';
import { authMiddleware } from '../middleware/auth';
import { adminGuard } from '../middleware/admin-guard';

export const adminRouter = Router();

adminRouter.use(authMiddleware, adminGuard);

adminRouter.get('/businesses', async (_req, res, next) => {
  try {
    const businesses = await prisma.business.findMany({
      include: { _count: { select: { calls: true, users: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(businesses);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const [businesses, calls, users, escalations] = await Promise.all([
      prisma.business.count(),
      prisma.call.count(),
      prisma.user.count(),
      prisma.escalation.count(),
    ]);
    return res.json({ businesses, calls, users, escalations });
  } catch (err) {
    next(err);
  }
});
