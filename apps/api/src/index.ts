import 'dotenv/config';
import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { env } from './config/env';
import { logger } from './config/logger';
import { redis } from './utils/redis';
import { apiLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { handleAtVoiceWebhook } from './webhooks/at-voice';
import { createCallSocketServer } from './ws/call-socket';
import { authRouter } from './routes/auth';
import { businessesRouter } from './routes/businesses';
import { callsRouter } from './routes/calls';
import { analyticsRouter } from './routes/analytics';
import { adminRouter } from './routes/admin';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/call' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/v1', apiLimiter);

// Webhooks (no auth)
app.post('/webhooks/at/voice', handleAtVoiceWebhook);

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/businesses', businessesRouter);
app.use('/api/v1/calls', callsRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/admin', adminRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

createCallSocketServer(wss);

async function start() {
  await redis.connect();
  logger.info('Redis connected');

  server.listen(env.PORT, () => {
    logger.info(`API server listening on port ${env.PORT}`);
  });
}

start().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
