import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { db, appointments, businesses } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireBusinessId } from '../middleware/ownership';
import { notifyBusinessOwners } from '../services/notifications';
import { dispatchWebhook } from '../services/webhooks';
import { sendAppointmentReminder } from '../services/whatsapp';
import { sendAppointmentSms } from '../services/sms';
import { audit } from '../services/audit';

export const appointmentsRouter: Router = Router();
appointmentsRouter.use(authMiddleware);
appointmentsRouter.use((req, res, next) => {
  if (req.user?.role === 'OWNER' && req.plan && !req.plan.features.ops) {
    return res.status(402).json({ error: 'Upgrade to Growth to access Appointments.' });
  }
  next();
});

/**
 * @openapi
 * tags:
 *   - name: Appointments
 *     description: Appointment and booking management
 */

/**
 * @openapi
 * /api/v1/appointments:
 *   get:
 *     tags: [Appointments]
 *     summary: List appointments with filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [SCHEDULED, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated appointments
 */
appointmentsRouter.get('/', async (req, res, next) => {
  try {
    const { status, from, page, limit } = z.object({
      status: z.enum(['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
      from: z.string().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query);

    const bid = requireBusinessId(req, res);
    if (!bid) return;
    const conditions: any[] = [eq(appointments.businessId, bid)];
    if (status) conditions.push(eq(appointments.status, status));
    if (from) conditions.push(gte(appointments.scheduledAt, new Date(from)));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(appointments).where(where).orderBy(desc(appointments.scheduledAt)).limit(limit).offset((page - 1) * limit),
      db.select({ n: sql<number>`count(*)` }).from(appointments).where(where),
    ]);
    return res.json({ appointments: rows, total: Number(countResult[0].n), page, limit });
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/appointments:
 *   post:
 *     tags: [Appointments]
 *     summary: Book an appointment
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [businessId, scheduledAt, customerPhone]
 *             properties:
 *               businessId: { type: string }
 *               contactId: { type: string }
 *               callId: { type: string }
 *               scheduledAt: { type: string, format: date-time }
 *               duration: { type: integer, default: 30, description: "Duration in minutes" }
 *               serviceType: { type: string }
 *               customerPhone: { type: string }
 *               customerName: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Appointment booked
 */
appointmentsRouter.post('/', async (req, res, next) => {
  try {
    const businessId = requireBusinessId(req, res);
    if (!businessId) return;
    const parsed = z.object({
      contactId: z.string().optional(),
      callId: z.string().optional(),
      scheduledAt: z.string().transform((v) => new Date(v)),
      duration: z.number().int().default(30),
      serviceType: z.string().optional(),
      customerPhone: z.string(),
      customerName: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    // Force the appointment onto the caller's own business — never trust a body businessId.
    const data = { ...parsed, businessId };

    const [appt] = await db.insert(appointments).values({
      businessId: data.businessId,
      contactId: data.contactId,
      callId: data.callId,
      scheduledAt: data.scheduledAt,
      duration: data.duration,
      serviceType: data.serviceType,
      customerPhone: data.customerPhone,
      customerName: data.customerName,
      notes: data.notes,
    }).returning();

    await audit(req, 'appointment.created', 'appointment', appt.id);
    await notifyBusinessOwners(data.businessId, 'New Appointment', `${data.serviceType ?? 'Appointment'} booked for ${data.customerName ?? data.customerPhone} on ${data.scheduledAt.toLocaleString()}`);
    await dispatchWebhook(data.businessId, 'appointment.created', { appointmentId: appt.id, scheduledAt: data.scheduledAt });

    const dateStr = data.scheduledAt.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });
    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, data.businessId)).limit(1);
    const businessName = biz?.name ?? 'your provider';
    await sendAppointmentSms(data.customerPhone, data.serviceType ?? 'Appointment', dateStr).catch(() => null);
    await sendAppointmentReminder(data.customerPhone, data.serviceType ?? 'Appointment', dateStr, businessName).catch(() => null);

    return res.status(201).json(appt);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/appointments/{id}:
 *   get:
 *     tags: [Appointments]
 *     summary: Get appointment details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Appointment details
 */
appointmentsRouter.get('/:id', async (req, res, next) => {
  try {
    const businessId = requireBusinessId(req, res);
    if (!businessId) return;
    const [appt] = await db.select().from(appointments)
      .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, businessId))).limit(1);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    return res.json(appt);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/appointments/{id}:
 *   patch:
 *     tags: [Appointments]
 *     summary: Update appointment status or details
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
 *               status: { type: string, enum: [SCHEDULED, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW] }
 *               scheduledAt: { type: string, format: date-time }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Updated appointment
 */
appointmentsRouter.patch('/:id', async (req, res, next) => {
  try {
    const data = z.object({
      status: z.enum(['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
      scheduledAt: z.string().transform((v) => new Date(v)).optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const businessId = requireBusinessId(req, res);
    if (!businessId) return;
    const [appt] = await db.update(appointments).set({ ...data, updatedAt: new Date() })
      .where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, businessId))).returning();
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    await audit(req, 'appointment.updated', 'appointment', appt.id, { status: data.status });
    if (data.status) {
      await dispatchWebhook(appt.businessId, 'appointment.status_changed', { appointmentId: appt.id, status: data.status });
    }
    return res.json(appt);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/appointments/{id}:
 *   delete:
 *     tags: [Appointments]
 *     summary: Cancel and delete an appointment
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
appointmentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const businessId = requireBusinessId(req, res);
    if (!businessId) return;
    await db.delete(appointments).where(and(eq(appointments.id, req.params.id), eq(appointments.businessId, businessId)));
    return res.status(204).send();
  } catch (err) { next(err); }
});
