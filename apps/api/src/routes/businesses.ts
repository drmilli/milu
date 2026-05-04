import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, businesses, knowledgeBases, knowledgeDocuments, kbChats, phoneNumbers, users, phoneVerifications, notifications, catalogItems, phoneNumberRequests } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendCustomSms } from '../services/sms';
import { searchAvailableNumbers, purchaseNumber, releaseNumber } from '../services/infobip';
import { scrapeWebsite, extractText, detectFileType, summariseContent, kbChat, ChatMessage } from '../services/document-extract';
import multer from 'multer';

const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
import { sendTeamInviteEmail } from '../utils/email';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { audit } from '../services/audit';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { sendNotification } from '../services/notifications';

export const businessesRouter: Router = Router();
businessesRouter.use(authMiddleware);

function denyIfCoreOnly(req: any, res: any): boolean {
  if (req.user?.role === 'OWNER' && req.plan?.tier === 'ONE_TIME') {
    res.status(402).json({ error: 'Upgrade to access this feature.' });
    return true;
  }
  return false;
}

/**
 * @openapi
 * tags:
 *   - name: Businesses
 *     description: Business profile and configuration
 */

/**
 * @openapi
 * /api/v1/businesses/{id}:
 *   get:
 *     tags: [Businesses]
 *     summary: Get business details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Business details
 *       404:
 *         description: Not found
 */
businessesRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await db.select().from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    if (!result.length) return res.status(404).json({ error: 'Business not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}:
 *   put:
 *     tags: [Businesses]
 *     summary: Update business details
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
 *               industry: { type: string }
 *     responses:
 *       200:
 *         description: Updated business
 */
businessesRouter.put('/:id', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      industry: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const result = await db
      .update(businesses)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businesses.id, req.params.id))
      .returning();
    if (!result.length) return res.status(404).json({ error: 'Business not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/kb:
 *   get:
 *     tags: [Businesses]
 *     summary: Get knowledge base
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Knowledge base data
 */
businessesRouter.get('/:id/kb', async (req, res, next) => {
  try {
    const result = await db.select().from(knowledgeBases).where(eq(knowledgeBases.businessId, req.params.id)).limit(1);
    if (!result.length) return res.status(404).json({ error: 'Knowledge base not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/kb:
 *   put:
 *     tags: [Businesses]
 *     summary: Update knowledge base
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
 *               businessName: { type: string }
 *               operatingHours: { type: object }
 *               faqs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     question: { type: string }
 *                     answer: { type: string }
 *               escalationNumber: { type: string }
 *               voiceId: { type: string }
 *     responses:
 *       200:
 *         description: Updated knowledge base
 */
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
    const result = await db
      .update(knowledgeBases)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(knowledgeBases.businessId, req.params.id))
      .returning();
    if (!result.length) return res.status(404).json({ error: 'Knowledge base not found' });
    return res.json(result[0]);
  } catch (err) {
    next(err);
  }
});

// POST /businesses/:id/kb/scrape-website
businessesRouter.post('/:id/kb/scrape-website', async (req, res, next) => {
  try {
    const { url } = z.object({
      url: z.string().transform(u => u.startsWith('http') ? u : `https://${u}`).pipe(z.string().url()),
    }).parse(req.body);
    const content = await scrapeWebsite(url);
    const websiteSummary = await summariseContent(content, url);
    await db.update(knowledgeBases)
      .set({ websiteUrl: url, websiteContent: content, websiteSummary: websiteSummary || null, websiteScrapedAt: new Date(), updatedAt: new Date() })
      .where(eq(knowledgeBases.businessId, req.params.id));
    logger.info({ businessId: req.params.id, url, chars: content.length }, 'Website scraped');
    return res.json({ url, chars: content.length, preview: content.slice(0, 300), summary: websiteSummary || null });
  } catch (err) { next(err); }
});

// GET /businesses/:id/kb/documents
businessesRouter.get('/:id/kb/documents', async (req, res, next) => {
  try {
    const docs = await db.select().from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.businessId, req.params.id));
    return res.json(docs);
  } catch (err) { next(err); }
});

// POST /businesses/:id/kb/documents
businessesRouter.post('/:id/kb/documents', docUpload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const fileType = detectFileType(file.mimetype, file.originalname);
    const extractedText = await extractText(file.buffer, fileType, file.mimetype);
    const summary = await summariseContent(extractedText, file.originalname);

    const [doc] = await db.insert(knowledgeDocuments).values({
      businessId: req.params.id,
      name: file.originalname,
      fileType,
      extractedText: extractedText || null,
      summary: summary || null,
      sizeBytes: file.size,
    }).returning();

    logger.info({ businessId: req.params.id, name: file.originalname, fileType, chars: extractedText.length }, 'Document uploaded');
    return res.status(201).json(doc);
  } catch (err) { next(err); }
});

// DELETE /businesses/:id/kb/documents/:docId
businessesRouter.delete('/:id/kb/documents/:docId', async (req, res, next) => {
  try {
    await db.delete(knowledgeDocuments).where(
      and(eq(knowledgeDocuments.id, req.params.docId), eq(knowledgeDocuments.businessId, req.params.id))
    );
    return res.status(204).send();
  } catch (err) { next(err); }
});

// GET /businesses/:id/kb/chat  — load conversation history
businessesRouter.get('/:id/kb/chat', async (req, res, next) => {
  try {
    const msgs = await db.select().from(kbChats)
      .where(eq(kbChats.businessId, req.params.id))
      .orderBy(kbChats.createdAt);
    return res.json(msgs);
  } catch (err) { next(err); }
});

// POST /businesses/:id/kb/chat  — send a message and get AI reply
businessesRouter.post('/:id/kb/chat', async (req, res, next) => {
  try {
    const { message } = z.object({ message: z.string().min(1).max(2000) }).parse(req.body);

    // Save user message
    await db.insert(kbChats).values({ businessId: req.params.id, role: 'user', content: message });

    // Load KB context for system prompt
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.businessId, req.params.id)).limit(1);
    const docs = await db.select({ summary: knowledgeDocuments.summary, name: knowledgeDocuments.name })
      .from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, req.params.id));

    // Load last 20 messages for context
    const history = await db.select().from(kbChats)
      .where(eq(kbChats.businessId, req.params.id))
      .orderBy(kbChats.createdAt);
    const chatHistory: ChatMessage[] = history.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const reply = await kbChat(chatHistory, {
      businessName: kb?.businessName ?? 'this business',
      faqs: (kb?.faqs as { question: string; answer: string }[]) ?? [],
      websiteSummary: kb?.websiteSummary,
      docSummaries: docs.filter(d => d.summary).map(d => `${d.name}: ${d.summary}`),
    });

    // Save assistant reply
    await db.insert(kbChats).values({ businessId: req.params.id, role: 'assistant', content: reply });

    return res.json({ reply });
  } catch (err) { next(err); }
});

// ─── Products & Services (Catalog) ────────────────────────────────────────────

businessesRouter.get('/:id/catalog', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const { q, type } = z.object({
      q: z.string().optional(),
      type: z.enum(['PRODUCT', 'SERVICE']).optional(),
    }).parse(req.query);

    const conditions: any[] = [eq(catalogItems.businessId, req.params.id)];
    if (type) conditions.push(eq(catalogItems.type, type));
    if (q?.trim()) conditions.push(sql`${catalogItems.name} ILIKE ${'%' + q.trim() + '%'}`);
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select().from(catalogItems).where(where).orderBy(catalogItems.createdAt);
    return res.json(rows);
  } catch (err) { next(err); }
});

businessesRouter.post('/:id/catalog', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const data = z.object({
      type: z.enum(['PRODUCT', 'SERVICE']),
      name: z.string().min(1),
      description: z.string().optional().nullable(),
      price: z.number().int().nonnegative().optional().nullable(),
      currency: z.string().min(3).max(3).optional(),
      isAvailable: z.boolean().optional(),
      availabilityNote: z.string().optional().nullable(),
      tags: z.array(z.string()).optional(),
    }).parse(req.body);

    const [row] = await db.insert(catalogItems).values({
      businessId: req.params.id,
      type: data.type,
      name: data.name,
      description: data.description ?? null,
      price: data.price ?? null,
      currency: data.currency ?? 'NGN',
      isAvailable: data.isAvailable ?? true,
      availabilityNote: data.availabilityNote ?? null,
      tags: data.tags ?? [],
      updatedAt: new Date(),
    }).returning();

    return res.status(201).json(row);
  } catch (err) { next(err); }
});

businessesRouter.patch('/:id/catalog/:itemId', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const data = z.object({
      type: z.enum(['PRODUCT', 'SERVICE']).optional(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      price: z.number().int().nonnegative().optional().nullable(),
      currency: z.string().min(3).max(3).optional(),
      isAvailable: z.boolean().optional(),
      availabilityNote: z.string().optional().nullable(),
      tags: z.array(z.string()).optional(),
    }).parse(req.body);

    const [row] = await db.update(catalogItems).set({
      ...data,
      description: data.description === undefined ? undefined : (data.description ?? null),
      price: data.price === undefined ? undefined : (data.price ?? null),
      availabilityNote: data.availabilityNote === undefined ? undefined : (data.availabilityNote ?? null),
      updatedAt: new Date(),
    }).where(and(eq(catalogItems.id, req.params.itemId), eq(catalogItems.businessId, req.params.id))).returning();

    if (!row) return res.status(404).json({ error: 'Item not found' });
    return res.json(row);
  } catch (err) { next(err); }
});

businessesRouter.delete('/:id/catalog/:itemId', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    await db.delete(catalogItems).where(and(eq(catalogItems.id, req.params.itemId), eq(catalogItems.businessId, req.params.id)));
    return res.status(204).send();
  } catch (err) { next(err); }
});

// DELETE /businesses/:id/kb/chat  — clear conversation history
businessesRouter.delete('/:id/kb/chat', async (req, res, next) => {
  try {
    await db.delete(kbChats).where(eq(kbChats.businessId, req.params.id));
    return res.status(204).send();
  } catch (err) { next(err); }
});

// GET /businesses/:id/notifications — in-app notifications for this business
businessesRouter.get('/:id/notifications', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const rows = await db.select().from(notifications)
      .where(and(eq(notifications.businessId, req.params.id), sql`${notifications.readAt} is null`))
      .orderBy(sql`${notifications.createdAt} desc`)
      .limit(50);
    return res.json(rows);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/phone-numbers:
 *   get:
 *     tags: [Businesses]
 *     summary: List phone numbers for a business
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of phone numbers
 */
businessesRouter.get('/:id/phone-numbers', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const numbers = await db.select().from(phoneNumbers).where(eq(phoneNumbers.businessId, req.params.id));
    return res.json(numbers);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/phone-numbers/send-otp:
 *   post:
 *     tags: [Businesses]
 *     summary: Send a verification OTP to a phone number before adding it
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [number]
 *             properties:
 *               number: { type: string, example: "+2348012345678" }
 *     responses:
 *       200:
 *         description: OTP sent via SMS
 *       409:
 *         description: Number already registered
 */
businessesRouter.post('/:id/phone-numbers/send-otp', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const { number } = z.object({ number: z.string().min(7) }).parse(req.body);

    // Check not already taken
    const existing = await db.select({ id: phoneNumbers.id })
      .from(phoneNumbers).where(eq(phoneNumbers.number, number)).limit(1);
    if (existing.length) return res.status(409).json({ error: 'Phone number already registered' });

    // Expire previous pending OTPs for this business+number
    await db.delete(phoneVerifications).where(
      and(
        eq(phoneVerifications.businessId, req.params.id),
        eq(phoneVerifications.phone, number),
        eq(phoneVerifications.used, false),
      ),
    );

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(phoneVerifications).values({
      businessId: req.params.id,
      phone: number,
      code,
      expiresAt,
    });

    let smsSent = true;
    try {
      await sendCustomSms(
        number,
        `Your Milu verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
      );
    } catch (smsErr) {
      smsSent = false;
      logger.error({ err: smsErr, number }, 'Failed to send OTP SMS');
    }

    const payload: Record<string, unknown> = { message: 'OTP sent', number };
    if (!smsSent) payload.devCode = code; // surface code when SMS fails (Twilio trial restriction)

    return res.json(payload);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/phone-numbers/verify:
 *   post:
 *     tags: [Businesses]
 *     summary: Confirm OTP and register the phone number
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [number, code]
 *             properties:
 *               number: { type: string }
 *               code: { type: string }
 *               label: { type: string, description: "Optional friendly label" }
 *     responses:
 *       201:
 *         description: Phone number verified and added
 *       400:
 *         description: Invalid or expired code
 */
businessesRouter.post('/:id/phone-numbers/verify', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const { number, code, label } = z.object({
      number: z.string().min(7),
      code: z.string().length(6),
      label: z.string().optional(),
    }).parse(req.body);

    const [record] = await db.select().from(phoneVerifications).where(
      and(
        eq(phoneVerifications.businessId, req.params.id),
        eq(phoneVerifications.phone, number),
        eq(phoneVerifications.code, code),
        eq(phoneVerifications.used, false),
      ),
    ).limit(1);

    if (!record) return res.status(400).json({ error: 'Invalid code' });
    if (record.expiresAt < new Date()) return res.status(400).json({ error: 'Code expired. Please request a new one.' });

    await db.update(phoneVerifications).set({ used: true }).where(eq(phoneVerifications.id, record.id));

    let phone;
    try {
      [phone] = await db.insert(phoneNumbers)
        .values({ number, businessId: req.params.id, verified: true, label: label ?? null })
        .returning();
    } catch {
      return res.status(409).json({ error: 'Phone number already registered' });
    }

    await audit(req, 'phone_number.added', 'phone_number', phone.id, { number });
    return res.status(201).json(phone);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/phone-numbers/{numberId}:
 *   delete:
 *     tags: [Businesses]
 *     summary: Remove a phone number
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: numberId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Deleted
 */
businessesRouter.delete('/:id/phone-numbers/:numberId', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const [num] = await db.select().from(phoneNumbers).where(
      and(eq(phoneNumbers.id, req.params.numberId), eq(phoneNumbers.businessId, req.params.id))
    ).limit(1);
    // Release virtual numbers back to Infobip
    if (num?.isVirtual && num.provider === 'infobip' && num.providerNumberId) {
      try { await releaseNumber(num.providerNumberId); } catch { /* log but don't block delete */ }
    }
    await db.delete(phoneNumbers).where(
      and(eq(phoneNumbers.id, req.params.numberId), eq(phoneNumbers.businessId, req.params.id))
    );
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /businesses/:id/phone-numbers/virtual/available?countryCode=NG
businessesRouter.get('/:id/phone-numbers/virtual/available', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const { countryCode } = z.object({ countryCode: z.string().length(2).default('NG') }).parse(req.query);
    const numbers = await searchAvailableNumbers(countryCode);
    return res.json(numbers);
  } catch (err) { next(err); }
});

// POST /businesses/:id/phone-numbers/virtual/buy
businessesRouter.post('/:id/phone-numbers/virtual/buy', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const { numberKey, label } = z.object({
      numberKey: z.string(),
      label: z.string().optional(),
    }).parse(req.body);

    // Check business doesn't already have a virtual number
    const existing = await db.select({ id: phoneNumbers.id })
      .from(phoneNumbers)
      .where(and(eq(phoneNumbers.businessId, req.params.id), eq(phoneNumbers.isVirtual, true)))
      .limit(1);
    if (existing.length) return res.status(409).json({ error: 'Business already has a virtual number' });

    const purchased = await purchaseNumber(numberKey);

    const [phone] = await db.insert(phoneNumbers).values({
      number: purchased.number,
      businessId: req.params.id,
      verified: true,
      isVirtual: true,
      provider: 'infobip',
      providerNumberId: purchased.numberKey,
      label: label ?? 'Milu Virtual Number',
    }).returning();

    await audit(req, 'phone_number.virtual_purchased', 'phone_number', phone.id, { number: purchased.number });
    return res.status(201).json({
      ...phone,
      forwardingInstructions: getForwardingInstructions(purchased.number),
    });
  } catch (err) { next(err); }
});

businessesRouter.get('/:id/phone-number-requests', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    if (req.user?.role !== 'OWNER') return res.status(403).json({ error: 'Business access required' });
    if (!req.user.businessId || req.user.businessId !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

    const rows = await db.select({
      id: phoneNumberRequests.id,
      quantity: phoneNumberRequests.quantity,
      amountUsd: phoneNumberRequests.amountUsd,
      checkoutUrl: phoneNumberRequests.checkoutUrl,
      note: phoneNumberRequests.note,
      status: phoneNumberRequests.status,
      createdAt: phoneNumberRequests.createdAt,
    }).from(phoneNumberRequests).where(eq(phoneNumberRequests.businessId, req.params.id)).orderBy(desc(phoneNumberRequests.createdAt));

    return res.json(rows.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    if ((err as any)?.code === '42P01' || (err as any)?.code === '42704') return res.json([]);
    next(err);
  }
});

businessesRouter.post('/:id/phone-number-requests', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    if (req.user?.role !== 'OWNER') return res.status(403).json({ error: 'Business access required' });
    if (!req.user.businessId || req.user.businessId !== req.params.id) return res.status(403).json({ error: 'Forbidden' });

    const { quantity, note } = z.object({
      quantity: z.coerce.number().min(1).max(5).default(1),
      note: z.string().max(500).optional(),
    }).parse(req.body);

    const CHECKOUT_URL = 'https://whop.com/checkout/plan_hIqFgC9KKJEMX';
    const AMOUNT_USD_PER = 3;

    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    const [u] = await db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, req.user.userId)).limit(1);

    let row: { id: string; createdAt: Date } | undefined;
    try {
      [row] = await db.insert(phoneNumberRequests).values({
        businessId: req.params.id,
        requestedByUserId: req.user.userId,
        quantity,
        amountUsd: AMOUNT_USD_PER,
        checkoutUrl: CHECKOUT_URL,
        note,
      }).returning({ id: phoneNumberRequests.id, createdAt: phoneNumberRequests.createdAt });
    } catch (err) {
      if ((err as any)?.code === '42P01' || (err as any)?.code === '42704') {
        row = { id: crypto.randomUUID(), createdAt: new Date() };
      } else {
        throw err;
      }
    }

    const requesterName = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
    const requester = requesterName ? `${requesterName} <${u?.email ?? ''}>` : (u?.email ?? 'Unknown');
    const subject = `Phone number request — ${biz?.name ?? 'Business'} (${quantity}x)`;
    const bodyLines = [
      `Business: ${biz?.name ?? req.params.id}`,
      `Business ID: ${req.params.id}`,
      `Requested by: ${requester}`,
      `Quantity: ${quantity}`,
      `Price: $${AMOUNT_USD_PER} per number`,
      `Checkout: ${CHECKOUT_URL}`,
      note ? `Note: ${note}` : null,
      `Request ID: ${row?.id ?? ''}`,
    ].filter(Boolean) as string[];

    await sendNotification({
      title: subject,
      body: bodyLines.join('\n'),
      channel: 'EMAIL',
      recipient: 'info.miluai@gmail.com',
      data: { phoneNumberRequestId: row?.id ?? null, businessId: req.params.id },
    }).catch(() => null);

    await audit(req, 'phone_number.requested', 'phone_number_request', row?.id ?? '', { quantity, checkoutUrl: CHECKOUT_URL });

    return res.status(201).json({ id: row?.id, checkoutUrl: CHECKOUT_URL, amountUsd: AMOUNT_USD_PER, quantity, createdAt: row?.createdAt?.toISOString() });
  } catch (err) { next(err); }
});

function getForwardingInstructions(virtualNumber: string) {
  return {
    virtualNumber,
    instructions: {
      general: `Set up call forwarding on your existing business number to ${virtualNumber}`,
      mtn: `Dial **21*${virtualNumber}# on your MTN line to activate forwarding`,
      airtel: `Dial **21*${virtualNumber}# on your Airtel line to activate forwarding`,
      glo: `Dial **21*${virtualNumber}# on your Glo line to activate forwarding`,
      '9mobile': `Dial **21*${virtualNumber}# on your 9mobile line to activate forwarding`,
    },
  };
}

/**
 * @openapi
 * /api/v1/businesses/{id}/team:
 *   get:
 *     tags: [Businesses]
 *     summary: List team members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Team members list
 */
businessesRouter.get('/:id/team', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const members = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.businessId, req.params.id));
    return res.json(members);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/v1/businesses/{id}/team/{userId}:
 *   delete:
 *     tags: [Businesses]
 *     summary: Remove a team member
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Removed
 */
businessesRouter.delete('/:id/team/:userId', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    await db.update(users)
      .set({ businessId: null })
      .where(and(eq(users.id, req.params.userId), eq(users.businessId, req.params.id)));
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

businessesRouter.post('/:id/team/:userId/resend-invite', async (req, res, next) => {
  try {
    if (denyIfCoreOnly(req, res)) return;
    const [user] = await db.select({ id: users.id, email: users.email, businessId: users.businessId })
      .from(users)
      .where(and(eq(users.id, req.params.userId), eq(users.businessId, req.params.id)))
      .limit(1);

    if (!user) return res.status(404).json({ error: 'Team member not found' });

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashed = await bcrypt.hash(tempPassword, 10);
    await db.update(users).set({ password: hashed, updatedAt: new Date() }).where(eq(users.id, user.id));

    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, req.params.id)).limit(1);
    const businessName = biz?.name ?? 'your team';
    await sendTeamInviteEmail(user.email, businessName, tempPassword);

    return res.json({ message: 'Invite resent' });
  } catch (err) {
    next(err);
  }
});
