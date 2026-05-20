import { pgTable, text, timestamp, integer, jsonb, pgEnum, boolean, real } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// ─── Enums ────────────────────────────────────────────────────────────────────
export const subscriptionTierEnum = pgEnum('subscription_tier', ['STARTER', 'GROWTH', 'ENTERPRISE', 'ONE_TIME']);
export const callStatusEnum = pgEnum('call_status', ['ACTIVE', 'COMPLETED', 'FAILED']);
export const resolutionEnum = pgEnum('resolution_type', ['AI', 'HUMAN', 'ABANDONED']);
export const intentEnum = pgEnum('intent_type', ['FAQ', 'BOOKING', 'ORDER_STATUS', 'COMPLAINT', 'ESCALATE', 'UNKNOWN']);
export const userRoleEnum = pgEnum('user_role', ['OWNER', 'ADMIN']);
export const orderStatusEnum = pgEnum('order_status', ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']);
export const appointmentStatusEnum = pgEnum('appointment_status', ['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);
export const callbackStatusEnum = pgEnum('callback_status', ['PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED']);
export const notificationChannelEnum = pgEnum('notification_channel', ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP']);
export const notificationStatusEnum = pgEnum('notification_status', ['PENDING', 'SENT', 'FAILED', 'READ']);
export const escalationStatusEnum = pgEnum('escalation_status', ['OPEN', 'ASSIGNED', 'RESOLVED']);
export const catalogItemTypeEnum = pgEnum('catalog_item_type', ['PRODUCT', 'SERVICE']);
export const affiliateAgentStatusEnum = pgEnum('affiliate_agent_status', ['ACTIVE', 'SUSPENDED', 'BANNED']);
export const affiliateCommissionStatusEnum = pgEnum('affiliate_commission_status', ['PENDING', 'CONFIRMED', 'REVERSED', 'LOCKED']);
export const affiliateWithdrawalStatusEnum = pgEnum('affiliate_withdrawal_status', ['NEW', 'APPROVED', 'PAID', 'REJECTED']);
export const contactStageEnum = pgEnum('contact_stage', ['LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST']);
export const followUpTypeEnum = pgEnum('follow_up_type', ['CALL', 'WHATSAPP', 'NOTE', 'EMAIL']);
export const followUpStatusEnum = pgEnum('follow_up_status', ['PENDING', 'COMPLETED', 'CANCELLED']);
export const broadcastStatusEnum = pgEnum('broadcast_status', ['DRAFT', 'SENDING', 'COMPLETED', 'FAILED']);
export const templateStatusEnum = pgEnum('template_status', ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']);

// ─── Core ─────────────────────────────────────────────────────────────────────
export const businesses = pgTable('businesses', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  industry: text('industry'),
  contactPhone: text('contact_phone'),
  affiliateAgentId: text('affiliate_agent_id'),
  affiliateReferralCode: text('affiliate_referral_code'),
  affiliateReferredAt: timestamp('affiliate_referred_at', { withTimezone: true }),
  subscriptionTier: subscriptionTierEnum('subscription_tier').default('STARTER').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  ownerId: text('owner_id'),
});

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  role: userRoleEnum('role').default('OWNER').notNull(),
  businessId: text('business_id').references(() => businesses.id, { onDelete: 'set null' }),
  emailVerified: boolean('email_verified').default(false).notNull(),
  verificationToken: text('verification_token'),
  resetToken: text('reset_token'),
  resetTokenExpiry: timestamp('reset_token_expiry', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const phoneNumbers = pgTable('phone_numbers', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  number: text('number').notNull().unique(),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  verified: boolean('verified').default(false).notNull(),
  label: text('label'),
  isVirtual: boolean('is_virtual').default(false).notNull(),
  provider: text('provider'), // 'infobip' | 'twilio' | 'at' | null
  providerNumberId: text('provider_number_id'), // provider's internal ID for the number
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const knowledgeBases = pgTable('knowledge_base', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().unique().references(() => businesses.id, { onDelete: 'cascade' }),
  businessName: text('business_name').notNull(),
  operatingHours: jsonb('operating_hours').$type<Record<string, string>>().default({}).notNull(),
  faqs: jsonb('faqs').$type<{ question: string; answer: string }[]>().default([]).notNull(),
  escalationNumber: text('escalation_number'),
  voiceId: text('voice_id'),
  websiteUrl: text('website_url'),
  websiteContent: text('website_content'),
  websiteSummary: text('website_summary'),
  websiteScrapedAt: timestamp('website_scraped_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Knowledge Documents ──────────────────────────────────────────────────────
export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  fileType: text('file_type').notNull(), // 'pdf' | 'docx' | 'txt' | 'image'
  extractedText: text('extracted_text'),
  summary: text('summary'), // AI-generated summary
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── KB Chat History ──────────────────────────────────────────────────────────
export const kbChats = pgTable('kb_chats', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Agent Config ─────────────────────────────────────────────────────────────
export const agentConfigs = pgTable('agent_configs', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().unique().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text('name').default('Milu').notNull(),
  language: text('language').default('en').notNull(),
  tone: text('tone').default('friendly').notNull(),
  greeting: text('greeting'),
  fallbackMessage: text('fallback_message'),
  maxCallDuration: integer('max_call_duration').default(600).notNull(),
  enableRecording: boolean('enable_recording').default(true).notNull(),
  enableTranscription: boolean('enable_transcription').default(true).notNull(),
  voiceId: text('voice_id'),
  clonedVoiceId: text('cloned_voice_id'), // ElevenLabs custom cloned voice ID
  clonedVoiceName: text('cloned_voice_name'),
  businessHoursOnly: boolean('business_hours_only').default(false).notNull(),
  afterHoursMessage: text('after_hours_message'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Affiliates ───────────────────────────────────────────────────────────────
export const affiliateAgents = pgTable('affiliate_agents', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  referralCode: text('referral_code').notNull().unique(),
  status: affiliateAgentStatusEnum('status').default('ACTIVE').notNull(),
  commissionPercent: integer('commission_percent'),
  commissionMonths: integer('commission_months'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const affiliateSettings = pgTable('affiliate_settings', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  defaultCommissionPercent: integer('default_commission_percent').default(15).notNull(),
  defaultCommissionMonths: integer('default_commission_months').default(12).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const affiliateReferrals = pgTable('affiliate_referrals', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  affiliateAgentId: text('affiliate_agent_id').notNull().references(() => affiliateAgents.id, { onDelete: 'cascade' }),
  businessId: text('business_id').notNull().unique().references(() => businesses.id, { onDelete: 'cascade' }),
  referralCode: text('referral_code').notNull(),
  referredAt: timestamp('referred_at', { withTimezone: true }).defaultNow().notNull(),
  eligibilityEndsAt: timestamp('eligibility_ends_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const affiliateCommissions = pgTable('affiliate_commissions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  affiliateAgentId: text('affiliate_agent_id').notNull().references(() => affiliateAgents.id, { onDelete: 'cascade' }),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  paymentRef: text('payment_ref'),
  amountPaidUsd: integer('amount_paid_usd').notNull(),
  commissionPercent: integer('commission_percent').notNull(),
  commissionAmountUsd: integer('commission_amount_usd').notNull(),
  status: affiliateCommissionStatusEnum('status').default('PENDING').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const affiliateWithdrawalRequests = pgTable('affiliate_withdrawal_requests', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  affiliateAgentId: text('affiliate_agent_id').notNull().references(() => affiliateAgents.id, { onDelete: 'cascade' }),
  amountUsd: integer('amount_usd').notNull(),
  bankDetails: jsonb('bank_details').$type<Record<string, unknown>>().notNull(),
  status: affiliateWithdrawalStatusEnum('status').default('NEW').notNull(),
  adminNote: text('admin_note'),
  payoutReference: text('payout_reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Calls ────────────────────────────────────────────────────────────────────
export const calls = pgTable('calls', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id),
  contactId: text('contact_id'),
  callerNumber: text('caller_number').notNull(),
  callerName: text('caller_name'),
  callerLocation: text('caller_location'),
  awaitingProfile: boolean('awaiting_profile').default(false).notNull(),
  status: callStatusEnum('status').default('ACTIVE').notNull(),
  resolution: resolutionEnum('resolution'),
  intent: intentEnum('intent'),
  duration: integer('duration'),
  recordingUrl: text('recording_url'),
  topEmotion: text('top_emotion'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

export const transcripts = pgTable('transcripts', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  callId: text('call_id').notNull().references(() => calls.id, { onDelete: 'cascade' }),
  speaker: text('speaker').notNull(),
  text: text('text').notNull(),
  intent: intentEnum('intent'),
  emotion: text('emotion'),
  emotionScore: real('emotion_score').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const escalations = pgTable('escalations', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  callId: text('call_id').notNull().unique().references(() => calls.id, { onDelete: 'cascade' }),
  businessId: text('business_id').notNull().references(() => businesses.id),
  reason: text('reason').notNull(),
  summary: text('summary').notNull(),
  status: escalationStatusEnum('status').default('OPEN').notNull(),
  assignedTo: text('assigned_to').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── CRM Contacts ─────────────────────────────────────────────────────────────
export const contacts = pgTable('contacts', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  name: text('name'),
  location: text('location'),
  email: text('email'),
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  stage: contactStageEnum('stage').default('LEAD').notNull(),
  totalCalls: integer('total_calls').default(0).notNull(),
  lastCallAt: timestamp('last_call_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Follow-ups ───────────────────────────────────────────────────────────────
export const followUps = pgTable('follow_ups', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  callId: text('call_id').references(() => calls.id, { onDelete: 'set null' }),
  type: followUpTypeEnum('type').default('CALL').notNull(),
  title: text('title').notNull(),
  notes: text('notes'),
  status: followUpStatusEnum('status').default('PENDING').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  isAiSuggested: boolean('is_ai_suggested').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messageTemplates = pgTable('message_templates', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  body: text('body').notNull(),
  variables: jsonb('variables').$type<string[]>().default([]).notNull(),
  status: templateStatusEnum('status').default('DRAFT').notNull(),
  twilioSid: text('twilio_sid'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const messageBroadcasts = pgTable('message_broadcasts', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  templateId: text('template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),
  title: text('title'),
  message: text('message').notNull(),
  recipientFilter: jsonb('recipient_filter').$type<{ tags?: string[]; all?: boolean; contactIds?: string[]; phones?: string[] }>().default({}).notNull(),
  totalRecipients: integer('total_recipients').default(0).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  status: broadcastStatusEnum('status').default('DRAFT').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const broadcastRecipients = pgTable('broadcast_recipients', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  broadcastId: text('broadcast_id').notNull().references(() => messageBroadcasts.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  phone: text('phone').notNull(),
  status: text('status').default('PENDING').notNull(),
  twilioSid: text('twilio_sid'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  error: text('error'),
});

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orders = pgTable('orders', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  callId: text('call_id').references(() => calls.id, { onDelete: 'set null' }),
  orderNumber: text('order_number').notNull(),
  status: orderStatusEnum('status').default('PENDING').notNull(),
  items: jsonb('items').$type<{ name: string; qty: number; price: number }[]>().default([]).notNull(),
  totalAmount: integer('total_amount'),
  currency: text('currency').default('NGN').notNull(),
  customerPhone: text('customer_phone'),
  customerName: text('customer_name'),
  deliveryAddress: text('delivery_address'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Appointments ─────────────────────────────────────────────────────────────
export const appointments = pgTable('appointments', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  callId: text('call_id').references(() => calls.id, { onDelete: 'set null' }),
  status: appointmentStatusEnum('status').default('SCHEDULED').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  duration: integer('duration').default(30).notNull(),
  serviceType: text('service_type'),
  customerPhone: text('customer_phone'),
  customerName: text('customer_name'),
  notes: text('notes'),
  reminderSent: boolean('reminder_sent').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Products & Services (Catalog) ────────────────────────────────────────────
export const catalogItems = pgTable('catalog_items', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  type: catalogItemTypeEnum('type').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  price: integer('price'),
  currency: text('currency').default('NGN').notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  availabilityNote: text('availability_note'),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Callback Requests ────────────────────────────────────────────────────────
export const callbackRequests = pgTable('callback_requests', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  callId: text('call_id').references(() => calls.id, { onDelete: 'set null' }),
  phoneNumber: text('phone_number').notNull(),
  customerName: text('customer_name'),
  reason: text('reason'),
  status: callbackStatusEnum('status').default('PENDING').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  assignedTo: text('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  channel: notificationChannelEnum('channel').notNull(),
  status: notificationStatusEnum('status').default('PENDING').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
  recipient: text('recipient'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Webhook Configs ──────────────────────────────────────────────────────────
export const webhookConfigs = pgTable('webhook_configs', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: jsonb('events').$type<string[]>().default([]).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── API Keys ─────────────────────────────────────────────────────────────────
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  scopes: jsonb('scopes').$type<string[]>().default(['read']).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Settings ─────────────────────────────────────────────────────────────────
export const businessSettings = pgTable('business_settings', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().unique().references(() => businesses.id, { onDelete: 'cascade' }),
  notifyOnEscalation: boolean('notify_on_escalation').default(true).notNull(),
  notifyOnNewOrder: boolean('notify_on_new_order').default(true).notNull(),
  notifyOnNewAppointment: boolean('notify_on_new_appointment').default(true).notNull(),
  notifyChannels: jsonb('notify_channels').$type<string[]>().default(['EMAIL']).notNull(),
  whatsappNumber: text('whatsapp_number'),
  whatsappVerified: boolean('whatsapp_verified').default(false).notNull(),
  smsNumber: text('sms_number'),
  timezone: text('timezone').default('Africa/Lagos').notNull(),
  currency: text('currency').default('NGN').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Phone Verifications (OTP) ────────────────────────────────────────────────
export const phoneVerifications = pgTable('phone_verifications', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contactSubmissions = pgTable('contact_submissions', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull(),
  businessName: text('business_name'),
  reason: text('reason').notNull(),
  message: text('message').notNull(),
  pageUrl: text('page_url'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  status: text('status').default('NEW').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const phoneNumberRequests = pgTable('phone_number_requests', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  requestedByUserId: text('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  quantity: integer('quantity').default(1).notNull(),
  amountUsd: integer('amount_usd').default(3).notNull(),
  checkoutUrl: text('checkout_url').notNull(),
  note: text('note'),
  status: text('status').default('NEW').notNull(), // NEW | IN_REVIEW | FULFILLED | REJECTED
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dataConnectors = pgTable('data_connectors', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  businessId: text('business_id').notNull().unique().references(() => businesses.id, { onDelete: 'cascade' }),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  lastTestAt: timestamp('last_test_at', { withTimezone: true }),
  lastTestStatus: text('last_test_status'),
  lastTestError: text('last_test_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ────────────────────────────────────────────────────────────────
export const businessesRelations = relations(businesses, ({ many, one }) => ({
  phoneNumbers: many(phoneNumbers),
  knowledgeBase: one(knowledgeBases, { fields: [businesses.id], references: [knowledgeBases.businessId] }),
  agentConfig: one(agentConfigs, { fields: [businesses.id], references: [agentConfigs.businessId] }),
  settings: one(businessSettings, { fields: [businesses.id], references: [businessSettings.businessId] }),
  affiliateAgent: one(affiliateAgents, { fields: [businesses.affiliateAgentId], references: [affiliateAgents.id] }),
  affiliateReferral: one(affiliateReferrals, { fields: [businesses.id], references: [affiliateReferrals.businessId] }),
  dataConnector: one(dataConnectors, { fields: [businesses.id], references: [dataConnectors.businessId] }),
  calls: many(calls),
  users: many(users),
  contacts: many(contacts),
  orders: many(orders),
  appointments: many(appointments),
  catalogItems: many(catalogItems),
  escalations: many(escalations),
  webhookConfigs: many(webhookConfigs),
  phoneNumberRequests: many(phoneNumberRequests),
}));

export const usersRelations = relations(users, ({ one }) => ({
  business: one(businesses, { fields: [users.businessId], references: [businesses.id] }),
}));

export const callsRelations = relations(calls, ({ one, many }) => ({
  business: one(businesses, { fields: [calls.businessId], references: [businesses.id] }),
  contact: one(contacts, { fields: [calls.contactId], references: [contacts.id] }),
  transcripts: many(transcripts),
  escalation: one(escalations, { fields: [calls.id], references: [escalations.callId] }),
}));

export const escalationsRelations = relations(escalations, ({ one }) => ({
  call: one(calls, { fields: [escalations.callId], references: [calls.id] }),
  business: one(businesses, { fields: [escalations.businessId], references: [businesses.id] }),
  assignee: one(users, { fields: [escalations.assignedTo], references: [users.id] }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  business: one(businesses, { fields: [contacts.businessId], references: [businesses.id] }),
  calls: many(calls),
  orders: many(orders),
  appointments: many(appointments),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  business: one(businesses, { fields: [orders.businessId], references: [businesses.id] }),
  contact: one(contacts, { fields: [orders.contactId], references: [contacts.id] }),
  call: one(calls, { fields: [orders.callId], references: [calls.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  business: one(businesses, { fields: [appointments.businessId], references: [businesses.id] }),
  contact: one(contacts, { fields: [appointments.contactId], references: [contacts.id] }),
}));

export const catalogItemsRelations = relations(catalogItems, ({ one }) => ({
  business: one(businesses, { fields: [catalogItems.businessId], references: [businesses.id] }),
}));

export const affiliateAgentsRelations = relations(affiliateAgents, ({ many }) => ({
  referrals: many(affiliateReferrals),
  commissions: many(affiliateCommissions),
  withdrawalRequests: many(affiliateWithdrawalRequests),
}));

export const affiliateReferralsRelations = relations(affiliateReferrals, ({ one, many }) => ({
  agent: one(affiliateAgents, { fields: [affiliateReferrals.affiliateAgentId], references: [affiliateAgents.id] }),
  business: one(businesses, { fields: [affiliateReferrals.businessId], references: [businesses.id] }),
  commissions: many(affiliateCommissions),
}));

export const affiliateCommissionsRelations = relations(affiliateCommissions, ({ one }) => ({
  agent: one(affiliateAgents, { fields: [affiliateCommissions.affiliateAgentId], references: [affiliateAgents.id] }),
  business: one(businesses, { fields: [affiliateCommissions.businessId], references: [businesses.id] }),
}));

export const affiliateWithdrawalRequestsRelations = relations(affiliateWithdrawalRequests, ({ one }) => ({
  agent: one(affiliateAgents, { fields: [affiliateWithdrawalRequests.affiliateAgentId], references: [affiliateAgents.id] }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────
export type Business = typeof businesses.$inferSelect;
export type User = typeof users.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type Transcript = typeof transcripts.$inferSelect;
export type Escalation = typeof escalations.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type CatalogItem = typeof catalogItems.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AgentConfig = typeof agentConfigs.$inferSelect;
export type KbChat = typeof kbChats.$inferSelect;
export type CallbackRequest = typeof callbackRequests.$inferSelect;
export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type BusinessSettings = typeof businessSettings.$inferSelect;
export type PhoneVerification = typeof phoneVerifications.$inferSelect;
export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type PhoneNumberRequest = typeof phoneNumberRequests.$inferSelect;
export type DataConnector = typeof dataConnectors.$inferSelect;
export type FollowUp = typeof followUps.$inferSelect;
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type MessageBroadcast = typeof messageBroadcasts.$inferSelect;
export type BroadcastRecipient = typeof broadcastRecipients.$inferSelect;
