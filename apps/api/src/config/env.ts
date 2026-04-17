import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  AT_API_KEY: z.string().min(1).optional(),
  AT_USERNAME: z.string().min(1).optional(),
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_VOICE_ID: z.string().default('default'),
  // Gmail SMTP
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Milu <noreply@miluai.app>'),
  // Whop
  WHOP_API_KEY: z.string().optional(),
  WHOP_WEBHOOK_SECRET: z.string().optional(),
  WHOP_COMPANY_ID: z.string().optional(),
  // WhatsApp Business Cloud API
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_ID: z.string().optional(),
  // Auth
  JWT_SECRET: z.string().min(16),
  ADMIN_JWT_SECRET: z.string().min(16),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
