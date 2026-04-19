import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    logger.warn({
      method: req.method,
      url: req.url,
      userId: (req as any).user?.userId,
      issues: err.errors,
    }, 'Validation error');
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  logger.error({
    err,
    method: req.method,
    url: req.url,
    userId: (req as any).user?.userId,
    businessId: (req as any).user?.businessId,
    body: req.body,
  }, 'Unhandled error');

  res.status(500).json({ error: 'Internal server error' });
}
