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
import { authRouter } from './routes/auth';
import { businessesRouter } from './routes/businesses';
import { callsRouter } from './routes/calls';
import { analyticsRouter } from './routes/analytics';
import { adminRouter } from './routes/admin';
import { usersRouter } from './routes/users';
import { billingRouter, handleWhopWebhook } from './routes/billing';
import { handleAtVoiceWebhook } from './webhooks/at-voice';
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

// CORS
const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
app.use(cors({ origin: origins, credentials: true }));

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
app.post('/webhooks/at/voice', handleAtVoiceWebhook);
app.post('/webhooks/whop', handleWhopWebhook);

// Rate limiting on all API routes
app.use('/api/v1', apiLimiter);

// Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/businesses', businessesRouter);
app.use('/api/v1/calls', callsRouter);
app.use('/api/v1/analytics', analyticsRouter);
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

server.listen(env.PORT, () => {
  logger.info(`API server listening on port ${env.PORT}`);
  logger.info(`Swagger docs → http://localhost:${env.PORT}/docs`);
});

export default app;
