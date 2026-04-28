import 'dotenv/config';
import http from 'http';
import express, { type Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { swaggerSpec } from './swagger';
import { apiLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { httpLogger } from './middleware/http-logger';
import { and, eq, lt, sql as drizzleSql } from 'drizzle-orm';
import { db, calls } from './db';
import { authRouter } from './routes/auth';
import { businessesRouter } from './routes/businesses';
import { callsRouter } from './routes/calls';
import { analyticsRouter } from './routes/analytics';
import { adminRouter, adminAuthRouter } from './routes/admin';
import { usersRouter } from './routes/users';
import { billingRouter, handleWhopWebhook } from './routes/billing';
import { handleTwilioVoiceWebhook, handleTwilioVoiceGather, handleTwilioVoiceEnd, handleTwilioVoiceStatus, handleTwilioMessageStatus, handleTwilioIncomingMessage, handleTwilioIncomingMessageFallback } from './webhooks/twilio-voice';
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
app.post('/webhooks/twilio/voice/end', handleTwilioVoiceEnd);
app.post('/webhooks/twilio/voice/status', handleTwilioVoiceStatus);
app.post('/webhooks/twilio/message-status', handleTwilioMessageStatus);
app.post('/webhooks/twilio/incoming-message', handleTwilioIncomingMessage);
app.post('/webhooks/twilio/incoming-message/fallback', handleTwilioIncomingMessageFallback);
app.get('/webhooks/twilio/message-status', (_req, res) => res.sendStatus(200));
app.get('/webhooks/twilio/incoming-message', (_req, res) => res.sendStatus(200));
app.get('/webhooks/twilio/incoming-message/fallback', (_req, res) => res.sendStatus(200));
app.post('/webhooks/at/voice', handleAtVoiceWebhook);
app.post('/webhooks/at/voice/hold', handleAtHoldWebhook);
app.post('/webhooks/at/voice/record', handleAtRecordingWebhook);
// Infobip voice webhooks removed — using Twilio only for calls
app.get('/webhooks/whatsapp', verifyWhatsAppWebhook);
app.post('/webhooks/whatsapp', handleWhatsAppWebhook);
app.post('/webhooks/whop', handleWhopWebhook);
app.post('/webhooks/sendchamp', handleSendchampWebhook);

// Rate limiting on all API routes
app.use('/api/v1', apiLimiter);

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

app.use(errorHandler);

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

  // Close any ACTIVE calls stuck open from before the isActive=0 fix
  try {
    const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const result = await db.update(calls)
      .set({
        status: 'COMPLETED',
        resolution: drizzleSql`COALESCE(${calls.resolution}, 'ABANDONED'::resolution_type)`,
        endedAt: new Date(),
      })
      .where(and(eq(calls.status, 'ACTIVE'), lt(calls.startedAt, staleThreshold)));
    logger.info({ result }, 'Cleaned up stale ACTIVE calls on startup');
  } catch (err) {
    logger.warn({ err }, 'Stale call cleanup failed (non-fatal)');
  }
});

export default app;
