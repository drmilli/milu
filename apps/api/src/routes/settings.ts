import { Router } from 'express';
import { z } from 'zod';
import { eq, and, lt } from 'drizzle-orm';
import { db, businessSettings, phoneVerifications } from '../db';
import { authMiddleware } from '../middleware/auth';
import { audit } from '../services/audit';
import { sendWhatsAppOtp } from '../services/whatsapp';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const settingsRouter: Router = Router();
settingsRouter.use(authMiddleware);

function maskPhone(value: string) {
  const last4 = value.slice(-4);
  const prefix = value.slice(0, Math.max(0, value.length - 4));
  const maskedPrefix = prefix.replace(/\d/g, '*');
  return `${maskedPrefix}${last4}`;
}

/**
 * @openapi
 * tags:
 *   - name: Settings
 *     description: Business settings and preferences
 */

/**
 * @openapi
 * /api/v1/settings/{businessId}:
 *   get:
 *     tags: [Settings]
 *     summary: Get business settings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Business settings
 */
settingsRouter.get('/:businessId', async (req, res, next) => {
  try {
    const [settings] = await db.select().from(businessSettings)
      .where(eq(businessSettings.businessId, req.params.businessId)).limit(1);

    if (!settings) {
      return res.json({
        businessId: req.params.businessId,
        notifyOnEscalation: true,
        notifyOnNewOrder: true,
        notifyOnNewAppointment: true,
        notifyChannels: ['EMAIL'],
        whatsappNumber: null,
        smsNumber: null,
        timezone: 'Africa/Lagos',
        currency: 'NGN',
      });
    }
    return res.json(settings);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/settings/{businessId}:
 *   put:
 *     tags: [Settings]
 *     summary: Create or update business settings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notifyOnEscalation: { type: boolean }
 *               notifyOnNewOrder: { type: boolean }
 *               notifyOnNewAppointment: { type: boolean }
 *               notifyChannels:
 *                 type: array
 *                 items: { type: string, enum: [IN_APP, EMAIL, SMS, WHATSAPP] }
 *               whatsappNumber: { type: string }
 *               smsNumber: { type: string }
 *               timezone: { type: string, example: "Africa/Lagos" }
 *               currency: { type: string, example: "NGN" }
 *     responses:
 *       200:
 *         description: Saved settings
 */
settingsRouter.put('/:businessId', async (req, res, next) => {
  try {
    const data = z.object({
      notifyOnEscalation: z.boolean().optional(),
      notifyOnNewOrder: z.boolean().optional(),
      notifyOnNewAppointment: z.boolean().optional(),
      notifyChannels: z.array(z.enum(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'])).optional(),
      whatsappNumber: z.string().optional().nullable(),
      smsNumber: z.string().optional().nullable(),
      timezone: z.string().optional(),
      currency: z.string().optional(),
    }).parse(req.body);

    const existing = await db.select({ id: businessSettings.id }).from(businessSettings)
      .where(eq(businessSettings.businessId, req.params.businessId)).limit(1);

    let result;
    if (existing.length) {
      [result] = await db.update(businessSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(businessSettings.businessId, req.params.businessId))
        .returning();
    } else {
      [result] = await db.insert(businessSettings)
        .values({ businessId: req.params.businessId, ...data })
        .returning();
    }

    await audit(req, 'settings.updated', 'settings', result.id);
    return res.json(result);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/settings/{businessId}/whatsapp/send-otp:
 *   post:
 *     tags: [Settings]
 *     summary: Send a 6-digit OTP to a WhatsApp number for verification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: "+2348012345678" }
 *     responses:
 *       200:
 *         description: OTP sent
 */
settingsRouter.post('/:businessId/whatsapp/send-otp', async (req, res, next) => {
  try {
    const { phone } = z.object({ phone: z.string().min(7) }).parse(req.body);

    logger.info({ businessId: req.params.businessId, phone: maskPhone(phone) }, 'WhatsApp OTP requested');

    await db.delete(phoneVerifications).where(and(
      eq(phoneVerifications.businessId, req.params.businessId),
      eq(phoneVerifications.phone, phone),
      eq(phoneVerifications.used, false),
    ));
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.insert(phoneVerifications).values({
      businessId: req.params.businessId, phone, code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    let sent = true;
    try {
      await sendWhatsAppOtp(phone, code);
    } catch (waErr) {
      sent = false;
      logger.error({ err: waErr, phone }, 'Failed to send WhatsApp OTP');
    }
    if (sent) {
      logger.info({ businessId: req.params.businessId, phone: maskPhone(phone) }, 'WhatsApp OTP sent');
    }
    if (!sent && env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Could not send WhatsApp message.' });
    }
    const payload: Record<string, unknown> = { message: 'OTP sent to WhatsApp number', phone };
    if (!sent) payload.devCode = code;
    return res.json(payload);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/settings/{businessId}/whatsapp/verify:
 *   post:
 *     tags: [Settings]
 *     summary: Confirm OTP and save verified WhatsApp number
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, code]
 *             properties:
 *               phone: { type: string }
 *               code: { type: string }
 *     responses:
 *       200:
 *         description: WhatsApp number verified and saved
 *       400:
 *         description: Invalid or expired OTP
 */
settingsRouter.post('/:businessId/whatsapp/verify', async (req, res, next) => {
  try {
    const { phone, code } = z.object({
      phone: z.string().min(7),
      code: z.string().length(6),
    }).parse(req.body);

    const [record] = await db.select().from(phoneVerifications)
      .where(and(
        eq(phoneVerifications.businessId, req.params.businessId),
        eq(phoneVerifications.phone, phone),
        eq(phoneVerifications.used, false),
      )).limit(1);

    if (!record) return res.status(400).json({ error: 'Invalid code' });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'Code expired' });

    if (record.code !== code) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Mark OTP as used
    await db.update(phoneVerifications).set({ used: true }).where(eq(phoneVerifications.id, record.id));

    // Save verified number to settings (upsert)
    const existing = await db.select({ id: businessSettings.id })
      .from(businessSettings)
      .where(eq(businessSettings.businessId, req.params.businessId)).limit(1);

    let settings;
    if (existing.length) {
      [settings] = await db.update(businessSettings)
        .set({ whatsappNumber: phone, whatsappVerified: true, updatedAt: new Date() })
        .where(eq(businessSettings.businessId, req.params.businessId))
        .returning();
    } else {
      [settings] = await db.insert(businessSettings)
        .values({ businessId: req.params.businessId, whatsappNumber: phone, whatsappVerified: true })
        .returning();
    }

    await audit(req, 'settings.whatsapp_verified', 'settings', settings.id, { phone });
    return res.json({ message: 'WhatsApp number verified', whatsappNumber: phone, whatsappVerified: true });
  } catch (err) { next(err); }
});
