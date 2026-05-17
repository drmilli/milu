import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ilike, desc, sql, or } from 'drizzle-orm';
import { db, contacts, calls, orders, appointments } from '../db';
import { authMiddleware } from '../middleware/auth';
import { audit } from '../services/audit';

export const contactsRouter: Router = Router();
contactsRouter.use(authMiddleware);

function requireCrm(req: any, res: any): boolean {
  if (req.user?.role === 'OWNER' && req.plan && !req.plan.features.crm) {
    res.status(402).json({ error: 'CRM (contacts & sales pipeline) requires the Enterprise plan. Contact us to upgrade.' });
    return true;
  }
  return false;
}

/**
 * @openapi
 * tags:
 *   - name: Contacts
 *     description: CRM — caller profiles and history
 */

/**
 * @openapi
 * /api/v1/contacts:
 *   get:
 *     tags: [Contacts]
 *     summary: List contacts with search
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated contacts
 */
contactsRouter.get('/', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const { search, page, limit, stage } = z.object({
      search: z.string().max(100).optional(),
      stage: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);

    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });
    const conditions: any[] = [eq(contacts.businessId, bid)];
    if (search) conditions.push(or(ilike(contacts.phone, `%${search}%`), ilike(contacts.name, `%${search}%`), ilike(contacts.email, `%${search}%`)));
    if (stage) conditions.push(eq(contacts.stage, stage as any));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(contacts).where(where).orderBy(desc(contacts.lastCallAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(contacts).where(where),
    ]);

    return res.json({ contacts: rows, total: Number(countResult[0].n), page, limit });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/contacts:
 *   post:
 *     tags: [Contacts]
 *     summary: Create a contact
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessId, phone]
 *             properties:
 *               businessId: { type: string }
 *               phone: { type: string }
 *               name: { type: string }
 *               email: { type: string }
 *               notes: { type: string }
 *               tags: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Contact created
 */
contactsRouter.post('/', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const data = z.object({
      phone: z.string().min(5),
      name: z.string().optional(),
      location: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      stage: z.enum(['LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST']).optional(),
    }).parse(req.body);

    const [contact] = await db.insert(contacts).values({ ...data, businessId: bid }).returning();
    await audit(req, 'contact.created', 'contact', contact.id);
    return res.status(201).json(contact);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/contacts/{id}:
 *   get:
 *     tags: [Contacts]
 *     summary: Get contact with full history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Contact with calls, orders, appointments
 */
contactsRouter.get('/:id', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const [contact] = await db.select().from(contacts)
      .where(and(eq(contacts.id, req.params.id), eq(contacts.businessId, bid))).limit(1);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const [callHistory, orderHistory, appointmentHistory] = await Promise.all([
      db.select().from(calls).where(or(
        eq(calls.contactId, contact.id),
        and(eq(calls.businessId, contact.businessId), eq(calls.callerNumber, contact.phone)),
      )).orderBy(desc(calls.startedAt)).limit(20),
      db.select().from(orders).where(eq(orders.contactId, req.params.id)).orderBy(desc(orders.createdAt)).limit(20),
      db.select().from(appointments).where(eq(appointments.contactId, req.params.id)).orderBy(desc(appointments.scheduledAt)).limit(20),
    ]);

    return res.json({ ...contact, calls: callHistory, orders: orderHistory, appointments: appointmentHistory });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/contacts/{id}:
 *   patch:
 *     tags: [Contacts]
 *     summary: Update a contact
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
 *               name: { type: string }
 *               email: { type: string }
 *               notes: { type: string }
 *               tags: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Updated contact
 */
contactsRouter.patch('/:id', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const data = z.object({
      name: z.string().optional(),
      location: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      stage: z.enum(['LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST']).optional(),
    }).parse(req.body);

    const [contact] = await db.update(contacts).set({ ...data, updatedAt: new Date() })
      .where(and(eq(contacts.id, req.params.id), eq(contacts.businessId, bid))).returning();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    return res.json(contact);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/contacts/{id}:
 *   delete:
 *     tags: [Contacts]
 *     summary: Delete a contact
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
contactsRouter.delete('/:id', async (req, res, next) => {
  try {
    if (requireCrm(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const [deleted] = await db.delete(contacts)
      .where(and(eq(contacts.id, req.params.id), eq(contacts.businessId, bid)))
      .returning({ id: contacts.id });
    if (!deleted) return res.status(404).json({ error: 'Contact not found' });
    await audit(req, 'contact.deleted', 'contact', req.params.id);
    return res.status(204).send();
  } catch (err) { next(err); }
});
