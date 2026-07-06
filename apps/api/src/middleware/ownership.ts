import type { Request, Response } from 'express';

/**
 * Tenant-scoping helpers.
 *
 * `req.user.businessId` is set by `authMiddleware` and — for both OWNER and
 * ADMIN roles — is already validated against the optional `X-Business-Id`
 * header. It is the ONLY trustworthy business identifier on a request. A
 * `businessId` (or resource `:id`) supplied by the client in the path, query,
 * or body must never be trusted for tenant scoping: doing so is the root cause
 * of cross-tenant IDOR.
 */

/**
 * Returns the caller's authorized business scope, or writes a 403 and returns
 * `null`. Use at the top of any handler that reads/writes tenant-owned rows:
 *
 *   const businessId = requireBusinessId(req, res);
 *   if (!businessId) return;
 *   ... .where(and(eq(table.id, req.params.id), eq(table.businessId, businessId)))
 */
export function requireBusinessId(req: Request, res: Response): string | null {
  const businessId = req.user?.businessId;
  if (!businessId) {
    res.status(403).json({ error: 'No business associated with this account' });
    return null;
  }
  return businessId;
}

/**
 * Guard for `/:id`-style handlers where `:id` is itself a business the caller
 * must own. Writes a 403 and returns `false` when the target business does not
 * match the caller's scope; returns `true` when access is allowed.
 */
export function assertBusinessAccess(
  req: Request,
  res: Response,
  targetBusinessId: string | null | undefined,
): boolean {
  const scope = req.user?.businessId;
  if (!scope || !targetBusinessId || scope !== targetBusinessId) {
    res.status(403).json({ error: 'Access denied to this resource' });
    return false;
  }
  return true;
}
