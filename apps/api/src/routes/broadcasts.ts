import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db, messageBroadcasts, broadcastRecipients, contacts, businesses } from '../db';
import { authMiddleware } from '../middleware/auth';
import { sendBroadcastMessage } from '../services/whatsapp';
import { logger } from '../config/logger';

export const broadcastsRouter: Router = Router();
broadcastsRouter.use(authMiddleware);

function requireBroadcasts(req: any, res: any): boolean {
  if (req.user?.role === 'OWNER' && req.plan && !req.plan.features.broadcasts) {
    res.status(402).json({ error: 'Bulk WhatsApp broadcasts require the Growth or Enterprise plan. Upgrade at /billing.' });
    return true;
  }
  return false;
}

// GET /broadcasts — list broadcasts for business
broadcastsRouter.get('/', async (req, res, next) => {
  try {
    if (requireBroadcasts(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const rows = await db.select().from(messageBroadcasts)
      .where(eq(messageBroadcasts.businessId, bid))
      .orderBy(desc(messageBroadcasts.createdAt))
      .limit(50);

    return res.json({ broadcasts: rows });
  } catch (err) { next(err); }
});

// GET /broadcasts/:id — broadcast detail with recipients
broadcastsRouter.get('/:id', async (req, res, next) => {
  try {
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const [broadcast] = await db.select().from(messageBroadcasts)
      .where(and(eq(messageBroadcasts.id, req.params.id), eq(messageBroadcasts.businessId, bid))).limit(1);
    if (!broadcast) return res.status(404).json({ error: 'Not found' });

    const recipients = await db.select().from(broadcastRecipients)
      .where(eq(broadcastRecipients.broadcastId, req.params.id))
      .limit(200);

    return res.json({ ...broadcast, recipients });
  } catch (err) { next(err); }
});

// POST /broadcasts — create + send broadcast
broadcastsRouter.post('/', async (req, res, next) => {
  try {
    if (requireBroadcasts(req, res)) return;
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const data = z.object({
      title: z.string().max(120).optional(),
      message: z.string().min(1).max(1000),
      contactIds: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      phones: z.array(z.string()).optional(),
      all: z.boolean().optional(),
    }).parse(req.body);

    if (!data.contactIds?.length && !data.tags?.length && !data.all && !data.phones?.length) {
      return res.status(400).json({ error: 'Specify contactIds, tags, phones, or all: true' });
    }

    // Load business info
    const [biz] = await db.select({ name: businesses.name, contactPhone: businesses.contactPhone })
      .from(businesses).where(eq(businesses.id, bid)).limit(1);
    if (!biz) return res.status(404).json({ error: 'Business not found' });

    const businessName = biz.name;
    const businessPhone = biz.contactPhone ?? '';

    // Resolve recipient contacts
    let targetContacts: { id: string; phone: string; name: string | null; tags: string[] | null }[] = [];

    if (data.contactIds?.length || data.tags?.length || data.all) {
      const conditions: any[] = [eq(contacts.businessId, bid)];
      if (data.contactIds?.length) conditions.push(inArray(contacts.id, data.contactIds));
      let rows = await db.select({ id: contacts.id, phone: contacts.phone, name: contacts.name, tags: contacts.tags })
        .from(contacts).where(and(...conditions)).limit(500);
      if (data.tags?.length && !data.contactIds?.length) {
        rows = rows.filter(c => c.tags?.some(t => data.tags!.includes(t)));
      }
      targetContacts = rows;
    }

    // Add direct phone numbers (not from contacts)
    const directPhoneRecipients: { id: string; phone: string; name: string | null; tags: string[] | null }[] = [];
    if (data.phones?.length) {
      for (const ph of data.phones) {
        const normalized = ph.trim();
        if (normalized && !targetContacts.find(c => c.phone === normalized)) {
          directPhoneRecipients.push({ id: `direct:${normalized}`, phone: normalized, name: null, tags: null });
        }
      }
    }

    const allRecipients = [...targetContacts, ...directPhoneRecipients];
    if (!allRecipients.length) {
      return res.status(400).json({ error: 'No matching recipients found' });
    }

    // Create broadcast record
    const [broadcast] = await db.insert(messageBroadcasts).values({
      businessId: bid,
      title: data.title ?? null,
      message: data.message,
      recipientFilter: {
        all: data.all,
        contactIds: data.contactIds,
        tags: data.tags,
        phones: data.phones,
      },
      totalRecipients: allRecipients.length,
      status: 'SENDING',
      startedAt: new Date(),
    }).returning();

    // Insert recipient rows (PENDING)
    await db.insert(broadcastRecipients).values(
      allRecipients.map(c => ({
        broadcastId: broadcast.id,
        contactId: c.id.startsWith('direct:') ? null : c.id,
        phone: c.phone,
        status: 'PENDING',
      }))
    );

    // Respond immediately — send in background
    res.status(202).json({
      id: broadcast.id,
      totalRecipients: allRecipients.length,
      status: 'SENDING',
    });

    // Send messages in background (fire and forget with rate limiting)
    sendBroadcastInBackground(broadcast.id, allRecipients, businessName, data.message, businessPhone)
      .catch(err => logger.error({ err, broadcastId: broadcast.id }, 'Broadcast background sender crashed'));

  } catch (err) { next(err); }
});

// DELETE /broadcasts/:id — cancel a pending broadcast
broadcastsRouter.delete('/:id', async (req, res, next) => {
  try {
    const bid = req.user?.businessId;
    if (!bid) return res.status(401).json({ error: 'Unauthorized' });

    const [deleted] = await db.delete(messageBroadcasts)
      .where(and(eq(messageBroadcasts.id, req.params.id), eq(messageBroadcasts.businessId, bid)))
      .returning({ id: messageBroadcasts.id });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    return res.status(204).send();
  } catch (err) { next(err); }
});

// ─── Background sender ────────────────────────────────────────────────────────

async function sendBroadcastInBackground(
  broadcastId: string,
  recipients: { id: string; phone: string; name?: string | null }[],
  businessName: string,
  message: string,
  businessPhone: string,
) {
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      const result = await sendBroadcastMessage(
        recipient.phone,
        recipient.name || 'there',
        businessName,
        message,
        businessPhone,
      );

      await db.update(broadcastRecipients).set({
        status: 'SENT',
        twilioSid: (result as any)?.sid ?? null,
        sentAt: new Date(),
      }).where(and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.contactId, recipient.id),
      ));

      sent++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ broadcastId, phone: recipient.phone, err: errMsg }, 'Broadcast message failed');

      await db.update(broadcastRecipients).set({
        status: 'FAILED',
        error: errMsg,
      }).where(and(
        eq(broadcastRecipients.broadcastId, broadcastId),
        eq(broadcastRecipients.contactId, recipient.id),
      ));

      failed++;
    }

    // 1 message per second — stay within Twilio rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  // Mark broadcast complete
  await db.update(messageBroadcasts).set({
    status: failed === recipients.length ? 'FAILED' : 'COMPLETED',
    sentCount: sent,
    failedCount: failed,
    completedAt: new Date(),
  }).where(eq(messageBroadcasts.id, broadcastId));

  logger.info({ broadcastId, sent, failed }, 'Broadcast completed');
}
