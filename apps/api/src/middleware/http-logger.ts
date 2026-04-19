import pinoHttp from 'pino-http';
import { logger } from '../config/logger';

export const httpLogger = pinoHttp({
  logger: logger as any,
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} → ${res.statusCode} — ${err.message}`,
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword', 'req.body.token'],
    censor: '[REDACTED]',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
