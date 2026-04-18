import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ilike, desc, sql } from 'drizzle-orm';
import { db, contacts, calls, orders, appointments } from '../db';
import { authMiddleware } from '../middleware/auth';
import { audit } from '../services/audit';

export const contactsRouter: Router = Router();
contactsRouter.use(authMiddleware);

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
    const { businessId: qBid, search, page, limit } = z.object({
      businessId: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);

    const bid = req.user?.businessId ?? qBid;
    const conditions: any[] = [];
    if (bid) conditions.push(eq(contacts.businessId, bid));
    if (search) conditions.push(ilike(contacts.phone, `%${search}%`));
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
    const data = z.object({
      businessId: z.string(),
      phone: z.string().min(5),
      name: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }).parse(req.body);

    const [contact] = await db.insert(contacts).values(data).returning();
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
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, req.params.id)).limit(1);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const [callHistory, orderHistory, appointmentHistory] = await Promise.all([
      db.select().from(calls).where(eq(calls.callerNumber, contact.phone)).orderBy(desc(calls.startedAt)).limit(20),
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
    const data = z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }).parse(req.body);

    const [contact] = await db.update(contacts).set({ ...data, updatedAt: new Date() })
      .where(eq(contacts.id, req.params.id)).returning();
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
    await db.delete(contacts).where(eq(contacts.id, req.params.id));
    await audit(req, 'contact.deleted', 'contact', req.params.id);
    return res.status(204).send();
  } catch (err) { next(err); }
});
