import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db, followUps, contacts } from '../db';
import { authMiddleware } from '../middleware/auth';

export const followUpsRouter: Router = Router();
followUpsRouter.use(authMiddleware);

function requireCrm(req: any, res: any): boolean {
  if (req.user?.role === 'OWNER' && req.plan && !req.plan.features.crm) {
    res.status(402).json({ error: 'Sales follow-ups require the Enterprise plan. Contact us to upgrade.' });
    return true;
  }
  return false;
}

const typeSchema = z.enum(['CALL', 'WHATSAPP', 'NOTE', 'EMAIL']);
const statusSchema = z.enum(['PENDING', 'COMPLETED', 'CANCELLED']);

// List follow-ups for a business
followUpsRouter.get('/', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const { status, contactId, from, to } = z.object({
      status: statusSchema.optional(),
      contactId: z.string().optional(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
    }).parse(req.query);

    const conditions: any[] = [eq(followUps.businessId, bid)];
    if (status) conditions.push(eq(followUps.status, status));
    if (contactId) conditions.push(eq(followUps.contactId, contactId));
    if (from) conditions.push(gte(followUps.scheduledAt, new Date(from)));
    if (to) conditions.push(lte(followUps.scheduledAt, new Date(to)));

    const rows = await db.select().from(followUps)
      .where(and(...conditions as any))
      .orderBy(desc(followUps.scheduledAt))
      .limit(100);

    return res.json({ followUps: rows });
  } catch (err) { next(err); }
});

// Create a follow-up
followUpsRouter.post('/', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const data = z.object({
      contactId: z.string(),
      callId: z.string().optional(),
      type: typeSchema.default('CALL'),
      title: z.string().min(1),
      notes: z.string().optional(),
      scheduledAt: z.string(),
    }).parse(req.body);

    // Ensure the contact belongs to this business
    const [contact] = await db.select({ id: contacts.id }).from(contacts)
      .where(and(eq(contacts.id, data.contactId), eq(contacts.businessId, bid))).limit(1);
    if (!contact) return res.status(400).json({ error: 'Contact not found' });

    const [row] = await db.insert(followUps).values({
      businessId: bid,
      contactId: data.contactId,
      callId: data.callId,
      type: data.type,
      title: data.title,
      notes: data.notes,
      scheduledAt: new Date(data.scheduledAt),
      createdBy: req.user?.userId,
    }).returning();

    return res.status(201).json(row);
  } catch (err) { next(err); }
});

// Update a follow-up
followUpsRouter.patch('/:id', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const data = z.object({
      title: z.string().optional(),
      notes: z.string().optional(),
      status: statusSchema.optional(),
      scheduledAt: z.string().optional(),
      type: typeSchema.optional(),
    }).parse(req.body);

    const update: any = { ...data, updatedAt: new Date() };
    if (data.scheduledAt) update.scheduledAt = new Date(data.scheduledAt);
    if (data.status === 'COMPLETED') update.completedAt = new Date();

    const [row] = await db.update(followUps).set(update)
      .where(and(eq(followUps.id, req.params.id), eq(followUps.businessId, bid))).returning();
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(row);
  } catch (err) { next(err); }
});

// Delete a follow-up
followUpsRouter.delete('/:id', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    await db.delete(followUps)
      .where(and(eq(followUps.id, req.params.id), eq(followUps.businessId, bid)));
    return res.status(204).send();
  } catch (err) { next(err); }
});
