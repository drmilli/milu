import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_WHATSAPP_OTP_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_NOTIFICATION_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_ORDER_CONFIRM_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_ORDER_STATUS_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_APPOINTMENT_REMINDER_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_APPOINTMENT_CONFIRM_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_ESCALATION_ALERT_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_CALLBACK_REQUEST_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_MISSED_CALL_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_WEEKLY_SUMMARY_CONTENT_SID: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_VOICE_ID: z.string().default('default'),
  // Gmail SMTP
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Milu <noreply@miluai.app>'),
  EMAIL_PROVIDER: z.enum(['auto', 'gmail', 'brevo', 'sendchamp']).default('auto'),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().optional(),
  BREVO_SMTP_HOST: z.string().optional(),
  BREVO_SMTP_PORT: z.coerce.number().optional(),
  BREVO_SMTP_USER: z.string().optional(),
  BREVO_SMTP_PASSWORD: z.string().optional(),
  // Whop
  WHOP_API_KEY: z.string().optional(),
  WHOP_WEBHOOK_SECRET: z.string().optional(),
  WHOP_COMPANY_ID: z.string().optional(),
  // WhatsApp Business Cloud API
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  // Africa's Talking
  AT_API_KEY: z.string().optional(),
  AT_USERNAME: z.string().optional(),
  // Infobip
  INFOBIP_API_KEY: z.string().optional(),
  INFOBIP_BASE_URL: z.string().optional(),
  INFOBIP_WHATSAPP_SENDER: z.string().optional(),
  // Cloudinary (call recordings)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().optional(),
  // Sendchamp
  SENDCHAMP_API_KEY: z.string().optional(),
  SENDCHAMP_EMAIL_API_KEY: z.string().optional(),
  SENDCHAMP_WHATSAPP_SENDER: z.string().optional(), // WhatsApp-enabled number e.g. 2348120678278
  SENDCHAMP_SENDER_ID: z.string().optional(),       // SMS sender ID
  SENDCHAMP_SENDER_EMAIL: z.string().email().optional(),
  SENDCHAMP_SENDER_NAME: z.string().optional(),
  // Auth
  JWT_SECRET: z.string().min(16),
  ADMIN_JWT_SECRET: z.string().min(16),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
