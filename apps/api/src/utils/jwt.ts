import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  userId: string;
  businessId?: string;
  role: 'OWNER' | 'ADMIN' | 'AFFILIATE';
}

export function signToken(payload: JwtPayload, expiresIn: SignOptions['expiresIn'] = '7d'): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function signAdminToken(payload: JwtPayload, expiresIn: SignOptions['expiresIn'] = '8h'): string {
  return jwt.sign(payload, env.ADMIN_JWT_SECRET, { expiresIn });
}

export function verifyAdminToken(token: string): JwtPayload {
  return jwt.verify(token, env.ADMIN_JWT_SECRET) as JwtPayload;
}

export function signAffiliateToken(payload: JwtPayload, expiresIn: SignOptions['expiresIn'] = '30d'): string {
  return jwt.sign(payload, env.AFFILIATE_JWT_SECRET ?? env.JWT_SECRET, { expiresIn });
}

export function verifyAffiliateToken(token: string): JwtPayload {
  return jwt.verify(token, env.AFFILIATE_JWT_SECRET ?? env.JWT_SECRET) as JwtPayload;
}
