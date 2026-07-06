import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Webhook signature verification middleware.
 *
 * Every inbound webhook must prove it came from the expected provider before we
 * act on its payload (create calls, flip billing/notification state, etc.).
 *
 * Policy when the verifying secret is NOT configured:
 *   - production  → reject (fail closed); an unverifiable webhook is a bug.
 *   - non-prod    → allow with a warning so local testing isn't blocked.
 */
const isProd = env.NODE_ENV === 'production';

function missingSecret(res: Response, provider: string): boolean {
  if (isProd) {
    logger.error({ provider }, 'Webhook verification secret not configured — rejecting');
    res.status(503).json({ error: 'Webhook not configured' });
    return true; // handled (rejected)
  }
  logger.warn({ provider }, 'Webhook verification secret not configured — allowing in non-production');
  return false; // not handled — caller should continue
}

function fullUrl(req: Request): string {
  // Behind Railway's proxy `trust proxy` makes req.protocol reflect X-Forwarded-Proto.
  return `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

/** Validates Twilio's `X-Twilio-Signature` over the request URL + POST params. */
export function verifyTwilioSignature(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST') return next();
  const token = env.TWILIO_AUTH_TOKEN;
  if (!token) {
    if (missingSecret(res, 'twilio')) return;
    return next();
  }
  const signature = req.header('X-Twilio-Signature');
  const valid = !!signature && twilio.validateRequest(token, signature, fullUrl(req), req.body ?? {});
  if (!valid) {
    logger.warn({ url: req.originalUrl }, 'Invalid Twilio webhook signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }
  next();
}

/** Validates Meta's `X-Hub-Signature-256` HMAC over the raw request body. */
export function verifyMetaSignature(req: Request, res: Response, next: NextFunction) {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret) {
    if (missingSecret(res, 'whatsapp')) return;
    return next();
  }
  const header = req.header('X-Hub-Signature-256');
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!header || !rawBody) {
    logger.warn('WhatsApp webhook missing signature or raw body');
    return res.status(403).json({ error: 'Invalid signature' });
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!timingSafeEqualStr(header, expected)) {
    logger.warn('Invalid WhatsApp webhook signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }
  next();
}

/** Validates Sendchamp webhooks via an HMAC-SHA256 `X-Sendchamp-Signature` over the raw body. */
export function verifySendchampSignature(req: Request, res: Response, next: NextFunction) {
  const secret = env.SENDCHAMP_WEBHOOK_SECRET;
  if (!secret) {
    if (missingSecret(res, 'sendchamp')) return;
    return next();
  }
  const header = req.header('X-Sendchamp-Signature') ?? req.header('Signature');
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!header || !rawBody) {
    logger.warn('Sendchamp webhook missing signature or raw body');
    return res.status(403).json({ error: 'Invalid signature' });
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!timingSafeEqualStr(header, expected)) {
    logger.warn('Invalid Sendchamp webhook signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }
  next();
}

/**
 * Validates Africa's Talking webhooks via a shared-secret HMAC. AT does not send
 * a signature by default; configure your webhook URL with an `?s=<secret>`-style
 * token or a custom header and set AT_WEBHOOK_SECRET to match.
 */
export function verifyAtWebhook(req: Request, res: Response, next: NextFunction) {
  const secret = env.AT_WEBHOOK_SECRET;
  if (!secret) {
    if (missingSecret(res, 'africas-talking')) return;
    return next();
  }
  const provided = req.header('X-AT-Webhook-Secret') ?? (req.query.s as string | undefined);
  if (!provided || !timingSafeEqualStr(provided, secret)) {
    logger.warn('Invalid Africa\'s Talking webhook secret');
    return res.status(403).json({ error: 'Invalid signature' });
  }
  next();
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
