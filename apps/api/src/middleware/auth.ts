import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../utils/jwt';
import { db, businesses } from '../db';
import { eq } from 'drizzle-orm';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      plan?: {
        billingTier: 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'ONE_TIME';
        tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'ONE_TIME';
        isTrial: boolean;
        trialEndsAt?: string;
        limits: {
          callsPerMonth: number | null;
          teamMembers: number | null;
          virtualNumbers: number | null;
        };
        features: {
          ops: boolean;
          callRecording: boolean;
          analytics: 'none' | 'basic' | 'full';
          notifications: { email: boolean; sms: boolean; whatsapp: boolean };
        };
      };
    }
  }
}

function trialEndsAt(createdAt: Date) {
  return new Date(createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);
}

function buildPlan(input: { billingTier: 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'ONE_TIME'; isTrial: boolean; createdAt: Date }) {
  const tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'ONE_TIME' = input.isTrial ? 'GROWTH' : input.billingTier;

  if (tier === 'ONE_TIME') {
    return {
      billingTier: input.billingTier,
      tier,
      isTrial: false,
      trialEndsAt: undefined,
      limits: { callsPerMonth: 200, teamMembers: 1, virtualNumbers: 1 },
      features: {
        ops: false,
        callRecording: false,
        analytics: 'none' as const,
        notifications: { email: false, sms: false, whatsapp: false },
      },
    };
  }

  if (tier === 'STARTER') {
    return {
      billingTier: input.billingTier,
      tier,
      isTrial: input.isTrial,
      trialEndsAt: input.isTrial ? trialEndsAt(input.createdAt).toISOString() : undefined,
      limits: { callsPerMonth: 200, teamMembers: 2, virtualNumbers: 1 },
      features: {
        ops: false,
        callRecording: false,
        analytics: 'basic' as const,
        notifications: { email: true, sms: false, whatsapp: false },
      },
    };
  }

  if (tier === 'GROWTH') {
    return {
      billingTier: input.billingTier,
      tier,
      isTrial: input.isTrial,
      trialEndsAt: input.isTrial ? trialEndsAt(input.createdAt).toISOString() : undefined,
      limits: { callsPerMonth: 500, teamMembers: null, virtualNumbers: 1 },
      features: {
        ops: true,
        callRecording: true,
        analytics: 'full' as const,
        notifications: { email: true, sms: true, whatsapp: true },
      },
    };
  }

  return {
    billingTier: input.billingTier,
    tier: 'ENTERPRISE' as const,
    isTrial: false,
    trialEndsAt: undefined,
    limits: { callsPerMonth: null, teamMembers: null, virtualNumbers: null },
    features: {
      ops: true,
      callRecording: true,
      analytics: 'full' as const,
      notifications: { email: true, sms: true, whatsapp: true },
    },
  };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    req.user = verifyToken(header.slice(7));
    if (req.user.role === 'OWNER' && req.user.businessId) {
      const [biz] = await db
        .select({ subscriptionTier: businesses.subscriptionTier, createdAt: businesses.createdAt })
        .from(businesses)
        .where(eq(businesses.id, req.user.businessId))
        .limit(1);

      if (!biz) return res.status(401).json({ error: 'Business not found for user' });

      const billingTier = (biz.subscriptionTier ?? 'STARTER') as 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'ONE_TIME';
      const now = new Date();
      const isTrial = billingTier === 'STARTER' && now < trialEndsAt(biz.createdAt);

      req.plan = buildPlan({ billingTier, isTrial, createdAt: biz.createdAt });
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
