import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 })
  : null;
