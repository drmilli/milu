import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

export const httpLogger = pinoHttp({
  logger: logger as any,
  // Skip health checks from logs
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
  // Add user context to each request log
  customProps: (req: any) => ({
    userId: req.user?.userId,
    businessId: req.user?.businessId,
    role: req.user?.role,
  }),
  // Log response time
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} → ${res.statusCode} — ${err.message}`,
  // Redact sensitive fields
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword', 'req.body.token'],
    censor: '[REDACTED]',
  },
  // Warn on slow requests (>2s)
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
