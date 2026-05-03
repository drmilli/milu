# Milu — Feature Inventory & Pricing Worksheet

Last updated: 2026-05-01

This document lists the features currently implemented in the Milu codebase so the team can decide what belongs in each pricing tier.

## 1) Product Overview (What Milu does)

Milu is an AI phone agent platform for businesses. It answers inbound calls, uses a business “knowledge base” + settings to respond, can take actions (appointments/orders), escalates to humans when needed, logs calls/transcripts/recordings, and shows everything in a dashboard (business) + admin panel.

## 2) Supported Channels (Customer touchpoints)

### Voice (Inbound calling)

- Twilio inbound voice agent (speech → AI → TTS).
- Africa’s Talking inbound voice agent (record per turn → transcription → AI → TTS playback).
- Infobip inbound voice agent (NCCO talk + speech input loop).

### Messaging (Owner/team notifications + inbound messages)

- WhatsApp notifications (e.g., escalations / alerts) via Twilio.
- SMS notifications (e.g., order received, appointment reminder).
- Email notifications (verification/reset/team invites/billing emails).

## 3) AI Agent Capabilities (What the agent can do)

### Conversation + responses

- Uses business context:
  - Business name, FAQs, website summary, uploaded document summaries.
  - Agent settings: name, language, tone, greeting script, fallback message, business-hours behavior.
- Handles common intents (examples): FAQ, booking, order, complaints, escalation.
- Urgency detection (keywords like “urgent”) to immediately escalate.

### Actions the agent can trigger

- Create an appointment (writes to DB) when the caller provides date/time + details.
- Create an order (writes to DB) when the caller provides items + details.
- Escalate to a human (creates escalation record + notifies owners).

### Products & Services awareness

- Businesses can manage a Products/Services catalog (availability + pricing).
- The phone agent reads from this catalog when customers ask “what’s available” / “how much” and responds accordingly.

## 4) Call Logging, Transcripts, and Recordings

### Call logs

- Stores calls with status, resolution (AI/HUMAN/ABANDONED), intent, duration, timestamps.
- Stores per-turn transcripts (caller + agent).

### Recordings

- Twilio: call recording is captured and stored as a playable URL.
- Cloudinary: recordings can be uploaded to Cloudinary and the Cloudinary URL is stored for dashboard playback.

## 5) CRM / Operations Modules (DB-backed)

- Contacts (caller identity tracking by phone number).
- Orders (status workflow, items, totals, delivery address, notes).
- Appointments (scheduled time, duration, service type, notes).
- Escalations (open/assigned/resolved) with reason + summary and owner alerts.
- Notifications (in-app + WhatsApp + SMS + email patterns).
- Callback requests (store request + scheduling metadata).

## 6) Business Dashboard (what the business user sees)

Pages currently present in the dashboard app:

- Overview
- Calls (list + transcript viewer + recording playback)
- Analytics (summary, intent breakdown, resolution breakdown, daily volume)
- Knowledge Base
  - FAQs + business info
  - Website scraping + summary
  - Document upload + extraction/summary
  - KB chat history
- Agent settings (voice, tone, greeting, language, business hours behavior)
- Phone Numbers
- Orders
- Appointments
- Products & Services (catalog CRUD)
- Team
- Billing (plans, usage, trial/renew dates)
- Settings

## 7) Admin Panel (what internal admins can do)

Pages currently present in the admin app:

- Admin dashboard
- Businesses list
  - Quick link to manage a business’s Products
- Business detail
  - Plan/status management
  - Phone numbers (provider assignment)
  - Recent calls (includes play button for recordings)
  - Products (catalog management)
- Calls (across all businesses, includes play button for recordings)
- Users
- Billing (admin view)
- WhatsApp (admin tooling/monitoring)
- Settings

## 8) Analytics & Reports

### Analytics endpoints (API)

- Summary stats (total calls, AI vs human vs abandoned, escalation count, AI resolution rate)
- Intents breakdown
- Resolution-rate breakdown
- Daily volume (last N days)

### Reports endpoints (API)

- CSV export: calls
- CSV export: orders
- Period summary: calls, orders, appointments, escalations, revenue, contacts

## 9) Integrations & Extensibility

### API keys

- Businesses can create/revoke API keys (scoped; plaintext shown once at creation).

### Webhook configurations (outbound)

- Businesses can create webhook configs with:
  - URL
  - event list
  - rotating secret for signing

### Billing integration

- Whop integration for checkout links + portal links (with fallback demo behavior).
- 10-day free trial logic (derived from business createdAt).

## 10) Environment / Ops Notes (for deployment)

### Twilio (voice + WhatsApp)

- Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and number config.

### Cloudinary (recordings)

- Requires:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
  - optional `CLOUDINARY_FOLDER` (defaults to `milu/calls`)

### AI providers

- OpenAI key used for LLM responses + TTS (when enabled/configured).
- Claude can be used as fallback when configured.

## 11) Pricing Worksheet (team discussion)

Use this table to decide which tier gets what. Mark each feature as Included/Not included, and add notes.

| Feature Area | Feature | Starter | Growth | Enterprise | Notes |
|---|---:|:---:|:---:|:---:|---|
| Voice | Twilio inbound voice agent |  |  |  | |
| Voice | Africa’s Talking inbound voice agent |  |  |  | |
| Voice | Infobip inbound voice agent |  |  |  | |
| AI | Knowledge base FAQs |  |  |  | |
| AI | Website scrape + summary |  |  |  | |
| AI | Document upload (PDF/DOC/TXT) extraction + summary |  |  |  | |
| AI | Products/Services catalog awareness |  |  |  | |
| Ops | Orders (agent-created + dashboard) |  |  |  | |
| Ops | Appointments (agent-created + dashboard) |  |  |  | |
| Ops | Escalations + WhatsApp alerts |  |  |  | |
| Data | Call logs + transcripts |  |  |  | |
| Data | Call recordings playback |  |  |  | |
| Analytics | Summary + charts |  |  |  | |
| Reports | CSV exports |  |  |  | |
| Team | Team members / roles |  |  |  | |
| Integrations | API keys |  |  |  | |
| Integrations | Outbound webhooks (CRM) |  |  |  | |
| Support | Priority support / SLA |  |  |  | |

## 12) Current Pricing Decisions (as agreed)

### Trial (10 days)

- Access: all features enabled (equivalent to Growth feature access)

### Growth

- Price: $45/month (about 60% off initial $110)
- Limits: 500 calls/month, 1 phone number
- Access: all features

### Starter

- Price: $25/month (about 60% off initial $65)
- Limits: 200 calls/month, 1 phone number, max 2 team members
- Access:
  - All Voice
  - All AI
  - No Ops (no Orders, no Appointments)
  - Notifications: Email only
  - Data: all call logs/transcripts, no call recordings
  - Analytics: basic
  - Reports: included

### Upgrade prompts

- When a user attempts to access a feature outside their plan, show an “Upgrade” message prompting them to upgrade.

### Current “marketing” plan hints in repo (for reference)

- Website pricing page: `apps/website/app/pricing/page.tsx`
- Dashboard billing plan config: `apps/dashboard/app/(dashboard)/billing/page.tsx`
