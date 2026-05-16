import 'dotenv/config';
import http from 'http';
import express, { type Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { swaggerSpec } from './swagger';
import { apiLimiter, contactLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { httpLogger } from './middleware/http-logger';
import { and, eq, lt, sql as drizzleSql } from 'drizzle-orm';
import { z } from 'zod';
import { db, calls, contactSubmissions } from './db';
import { authRouter } from './routes/auth';
import { businessesRouter } from './routes/businesses';
import { callsRouter } from './routes/calls';
import { analyticsRouter } from './routes/analytics';
import { adminRouter, adminAuthRouter } from './routes/admin';
import { usersRouter } from './routes/users';
import { billingRouter, handleWhopWebhook } from './routes/billing';
import { handleTwilioVoiceWebhook, handleTwilioVoiceGather, handleTwilioVoiceRespond, handleTwilioVoiceEnd, handleTwilioVoiceRecording, handleTwilioVoiceStatus, handleTwilioMessageStatus, handleTwilioIncomingMessage, handleTwilioIncomingMessageFallback } from './webhooks/twilio-voice';
import { handleTwilioVoiceStream } from './webhooks/twilio-stream';
import { WebSocketServer } from 'ws';
// Infobip voice removed — using Twilio only for calls
import { verifyWhatsAppWebhook, handleWhatsAppWebhook } from './webhooks/whatsapp';
import { handleSendchampWebhook } from './webhooks/sendchamp';
import { handleAtVoiceWebhook, handleAtHoldWebhook, handleAtRecordingWebhook } from './webhooks/at-voice';
import { contactsRouter } from './routes/contacts';
import { ordersRouter } from './routes/orders';
import { appointmentsRouter } from './routes/appointments';
import { notificationsRouter } from './routes/notifications';
import { agentRouter } from './routes/agent';
import { callbacksRouter } from './routes/callbacks';
import { escalationsRouter } from './routes/escalations';
import { settingsRouter } from './routes/settings';
import { reportsRouter } from './routes/reports';
import { webhookConfigRouter } from './routes/webhookConfig';
import { auditLogsRouter } from './routes/auditLogs';
import { apiKeysRouter } from './routes/apiKeys';
import { redis, ttsStoreDelete, ttsStoreGet } from './utils/redis';
import { sendNotification } from './services/notifications';
import { affiliateAuthRouter, affiliateRouter } from './routes/affiliate';

const app: Express = express();
const server = http.createServer(app);

// Trust Railway's reverse proxy so rate-limiting uses real client IPs
app.set('trust proxy', 1);

// HTTP request logging — must be first
app.use(httpLogger);

// CORS — explicit headers before cors() as a safety net for Railway's proxy
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  next();
});
app.options('*', (_req, res) => res.sendStatus(200));
app.use(cors({ origin: '*' }));

// Parse JSON and capture raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// Swagger docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Milu API Docs',
  customCss: '.swagger-ui .topbar { background-color: #3B2314; }',
}));
app.get('/docs.json', (_req, res) => res.json(swaggerSpec));

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok', env: env.NODE_ENV }));

// Webhooks (no auth, before rate limiting)
app.post('/webhooks/twilio/voice', handleTwilioVoiceWebhook);
app.post('/webhooks/twilio/voice/gather', handleTwilioVoiceGather);
app.post('/webhooks/twilio/voice/respond', handleTwilioVoiceRespond);
app.post('/webhooks/twilio/voice/end', handleTwilioVoiceEnd);
app.post('/webhooks/twilio/voice/recording', handleTwilioVoiceRecording);
app.post('/webhooks/twilio/voice/status', handleTwilioVoiceStatus);
app.post('/webhooks/twilio/message-status', handleTwilioMessageStatus);
app.post('/webhooks/twilio/incoming-message', handleTwilioIncomingMessage);
app.post('/webhooks/twilio/incoming-message/fallback', handleTwilioIncomingMessageFallback);
app.get('/webhooks/twilio/message-status', (_req, res) => res.sendStatus(200));
app.get('/webhooks/twilio/incoming-message', (_req, res) => res.sendStatus(200));
app.get('/webhooks/twilio/incoming-message/fallback', (_req, res) => res.sendStatus(200));

app.get('/webhooks/tts/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.sendStatus(404);

  const inMem = ttsStoreGet(id);
  if (inMem) {
    ttsStoreDelete(id);
    const bytes = Buffer.from(inMem.b64, 'base64');
    res.setHeader('Content-Type', inMem.ct);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(bytes);
  }

  if (!redis) return res.sendStatus(404);
  const key = `tts:${id}`;
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return res.sendStatus(404);
  await redis.del(key).catch(() => null);

  let contentType = 'audio/mpeg';
  let b64 = raw;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { ct?: string; b64?: string };
      if (parsed.ct) contentType = parsed.ct;
      if (parsed.b64) b64 = parsed.b64;
    } catch {
      // ignore
    }
  }

  const bytes = Buffer.from(b64, 'base64');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(bytes);
});

app.post('/webhooks/at/voice', handleAtVoiceWebhook);
app.get('/webhooks/at/voice', handleAtVoiceWebhook);
app.post('/webhooks/at/voice/hold', handleAtHoldWebhook);
app.get('/webhooks/at/voice/hold', handleAtHoldWebhook);
app.post('/webhooks/at/voice/record', handleAtRecordingWebhook);
app.get('/webhooks/at/voice/record', handleAtRecordingWebhook);
// Infobip voice webhooks removed — using Twilio only for calls
app.get('/webhooks/whatsapp', verifyWhatsAppWebhook);
app.post('/webhooks/whatsapp', handleWhatsAppWebhook);
app.post('/webhooks/whop', handleWhopWebhook);
app.post('/webhooks/sendchamp', handleSendchampWebhook);

// Rate limiting on all API routes
app.use('/api/v1', apiLimiter);

app.post('/api/v1/contact', contactLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      firstName: z.string().min(1).max(80),
      lastName: z.string().min(1).max(80),
      email: z.string().email().max(200),
      businessName: z.string().max(140).optional(),
      reason: z.enum(['demo', 'sales', 'support', 'partnership', 'press', 'other']),
      message: z.string().min(5).max(4000),
      pageUrl: z.string().max(500).optional(),
    });
    const body = schema.parse(req.body);

    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

    const [row] = await db.insert(contactSubmissions).values({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      businessName: body.businessName,
      reason: body.reason,
      message: body.message,
      pageUrl: body.pageUrl,
      ipAddress: ipAddress || null,
      userAgent,
    }).returning({ id: contactSubmissions.id, createdAt: contactSubmissions.createdAt });

    const subject = `New website contact: ${body.reason.toUpperCase()} — ${body.firstName} ${body.lastName}`;
    const lines = [
      `Name: ${body.firstName} ${body.lastName}`,
      `Email: ${body.email}`,
      body.businessName ? `Business: ${body.businessName}` : null,
      `Reason: ${body.reason}`,
      body.pageUrl ? `Page: ${body.pageUrl}` : null,
      ipAddress ? `IP: ${ipAddress}` : null,
      '',
      body.message,
      '',
      `Submission ID: ${row?.id ?? ''}`,
      `Created At: ${row?.createdAt?.toISOString?.() ?? ''}`,
    ].filter(Boolean) as string[];

    await sendNotification({
      title: subject,
      body: lines.join('\n'),
      channel: 'EMAIL',
      recipient: 'info.miluai@gmail.com',
      data: { contactSubmissionId: row?.id ?? null, source: 'website' },
    }).catch(() => null);

    return res.status(201).json({ ok: true, id: row?.id });
  } catch (err) { next(err); }
});

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/businesses', businessesRouter);
app.use('/api/v1/calls', callsRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/admin/auth', adminAuthRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/billing', billingRouter);
app.use('/api/v1/contacts', contactsRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/appointments', appointmentsRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/agent', agentRouter);
app.use('/api/v1/callbacks', callbacksRouter);
app.use('/api/v1/escalations', escalationsRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/webhooks/configs', webhookConfigRouter);
app.use('/api/v1/audit-logs', auditLogsRouter);
app.use('/api/v1/api-keys', apiKeysRouter);
app.use('/api/v1/affiliate/auth', affiliateAuthRouter);
app.use('/api/v1/affiliate', affiliateRouter);

app.use(errorHandler);

// ─── WebSocket server for Twilio Media Streams ────────────────────────────────
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/webhooks/twilio/voice/stream')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleTwilioVoiceStream(ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(env.PORT, async () => {
  logger.info({
    port: env.PORT,
    env: env.NODE_ENV,
    cors: '*',
    docs: `http://localhost:${env.PORT}/docs`,
    db: env.DATABASE_URL.replace(/:\/\/.*@/, '://***@'), // hide credentials
    twilio: !!env.TWILIO_ACCOUNT_SID,
    whatsapp: !!env.WHATSAPP_TOKEN,
    email: !!env.GMAIL_USER,
    whop: !!env.WHOP_API_KEY,
  }, 'Milu API started');

  async function closeStaleActiveCalls() {
    try {
      // Any call ACTIVE for more than 15 minutes is stuck — max legit call duration is ~10 min
      const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
      await db.update(calls)
        .set({
          status: 'COMPLETED',
          resolution: drizzleSql`COALESCE(${calls.resolution}, 'ABANDONED'::resolution_type)`,
          endedAt: new Date(),
        })
        .where(and(eq(calls.status, 'ACTIVE'), lt(calls.startedAt, staleThreshold)));
    } catch (err) {
      logger.warn({ err }, 'Stale call cleanup failed (non-fatal)');
    }
  }

  // Run once on startup to clear previously stuck calls
  await closeStaleActiveCalls();
  logger.info('Stale call cleanup ran on startup');

  // Then run every 5 minutes as a safety net
  setInterval(closeStaleActiveCalls, 5 * 60 * 1000);
});

export default app;
