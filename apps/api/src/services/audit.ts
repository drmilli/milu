import type { Request } from 'express';
import { db, auditLogs } from '../db';

export async function audit(
  req: Request,
  action: string,
  resource: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    businessId: req.user?.businessId,
    userId: req.user?.userId,
    action,
    resource,
    resourceId,
    metadata: metadata ?? {},
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip,
  });
}
