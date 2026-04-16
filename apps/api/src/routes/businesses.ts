import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@milu/db';
import { authMiddleware } from '../middleware/auth';

export const businessesRouter = Router();

businessesRouter.use(authMiddleware);

businessesRouter.get('/:id', async (req, res, next) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
      include: { phoneNumbers: true },
    });
    if (!business) return res.status(404).json({ error: 'Not found' });
    return res.json(business);
  } catch (err) {
    next(err);
  }
});

businessesRouter.put('/:id', async (req, res, next) => {
  try {
    const schema = z.object({ name: z.string().optional(), industry: z.string().optional() });
    const data = schema.parse(req.body);
    const business = await prisma.business.update({ where: { id: req.params.id }, data });
    return res.json(business);
  } catch (err) {
    next(err);
  }
});

businessesRouter.get('/:id/kb', async (req, res, next) => {
  try {
    const kb = await prisma.knowledgeBase.findUnique({ where: { businessId: req.params.id } });
    if (!kb) return res.status(404).json({ error: 'Not found' });
    return res.json(kb);
  } catch (err) {
    next(err);
  }
});

businessesRouter.put('/:id/kb', async (req, res, next) => {
  try {
    const schema = z.object({
      businessName: z.string().optional(),
      operatingHours: z.record(z.string()).optional(),
      faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
      escalationNumber: z.string().optional(),
      voiceId: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const kb = await prisma.knowledgeBase.update({
      where: { businessId: req.params.id },
      data,
    });
    return res.json(kb);
  } catch (err) {
    next(err);
  }
});
