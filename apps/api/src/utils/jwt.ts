import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  userId: string;
  businessId?: string;
  role: 'OWNER' | 'ADMIN';
}

export function signToken(payload: JwtPayload, expiresIn = '7d'): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function signAdminToken(payload: JwtPayload, expiresIn = '8h'): string {
  return jwt.sign(payload, env.ADMIN_JWT_SECRET, { expiresIn });
}

export function verifyAdminToken(token: string): JwtPayload {
  return jwt.verify(token, env.ADMIN_JWT_SECRET) as JwtPayload;
}
