import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 })
  : null;

export const ttsStore = new Map<string, { ct: string; b64: string; expiresAt: number }>();

export function ttsStoreSet(id: string, ct: string, b64: string, ttlSeconds: number) {
  ttsStore.set(id, { ct, b64, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function ttsStoreGet(id: string): { ct: string; b64: string } | null {
  const entry = ttsStore.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ttsStore.delete(id);
    return null;
  }
  return { ct: entry.ct, b64: entry.b64 };
}

export function ttsStoreDelete(id: string) {
  ttsStore.delete(id);
}
