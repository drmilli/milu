# milu.

> AI voice customer service for African businesses. Every call answered, every customer kept.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Overview

Milu is a full-stack AI voice agent platform. Inbound calls to a business phone number are answered by an AI agent that handles FAQs, books appointments, and escalates complex calls to a human — all in real time.

This monorepo contains:

```
milu/
├── apps/
│   ├── api/          # Node.js backend — call handling, LLM orchestration
│   ├── dashboard/    # Next.js business owner dashboard
│   └── onboarding/   # Next.js self-serve signup and setup flow
├── packages/
│   ├── agent-core/   # Voice agent pipeline (STT → LLM → TTS)
│   ├── telephony/    # Africa's Talking + Twilio adapters
│   └── db/           # Shared Prisma schema and migrations
├── docs/             # Architecture docs and ADRs
└── infra/            # Railway / Docker configs
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Telephony | [Africa's Talking Voice API](https://africastalking.com) |
| Speech-to-text | [Deepgram](https://deepgram.com) — streaming, real-time |
| LLM | [Anthropic Claude](https://anthropic.com) via API |
| Text-to-speech | [ElevenLabs](https://elevenlabs.io) |
| Backend | Node.js 20 + Express + TypeScript |
| Real-time | WebSockets (ws library) |
| Dashboard | Next.js 14 (App Router) |
| Database | PostgreSQL + Prisma ORM |
| Cache / session | Redis |
| Notifications | WhatsApp Business API + SendGrid |
| Hosting | Railway |

---

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 15
- Redis >= 7
- pnpm >= 8 (`npm install -g pnpm`)
- Africa's Talking account (voice enabled)
- Deepgram API key
- Anthropic API key
- ElevenLabs API key

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/your-org/milu.git
cd milu
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Required variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/milu

# Redis
REDIS_URL=redis://localhost:6379

# Africa's Talking
AT_API_KEY=your_africastalking_api_key
AT_USERNAME=your_africastalking_username

# Deepgram
DEEPGRAM_API_KEY=your_deepgram_api_key

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=default_voice_id

# WhatsApp (for escalation alerts)
WHATSAPP_TOKEN=your_whatsapp_business_token
WHATSAPP_PHONE_ID=your_phone_number_id

# App
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
JWT_SECRET=change_this_in_production
```

### 4. Set up the database

```bash
pnpm --filter @milu/db db:migrate
pnpm --filter @milu/db db:seed   # optional: seeds demo business data
```

### 5. Start development servers

```bash
pnpm dev
```

This starts all apps concurrently:

| App | URL | Description |
|---|---|---|
| `api` | http://localhost:4000 | REST + WebSocket server |
| `dashboard` | http://localhost:3000 | Business owner UI |
| `onboarding` | http://localhost:3001 | Signup + setup flow |

---

## Architecture

### Call Flow

```
Customer dials number
        │
        ▼
Africa's Talking (inbound call webhook)
        │  POST /webhooks/at/voice
        ▼
API server receives call event
        │
        ▼
WebSocket audio stream opens (bidirectional)
        │
        ├─► Deepgram STT (streaming transcription)
        │         │
        │         ▼
        │   Transcript chunk received
        │         │
        │         ▼
        │   Claude LLM (system-prompted with business KB)
        │         │
        │         ▼
        │   Response text generated
        │         │
        │         ▼
        │   ElevenLabs TTS (text → audio)
        │         │
        ◄─────────┘
        │
Audio streamed back to caller
        │
        ▼ (if escalation triggered)
Transfer to human agent phone
        + WhatsApp summary sent to owner
```

Target round-trip latency per turn: **< 1.5 seconds**

### Key Modules

#### `packages/agent-core`

The core voice pipeline. Handles the STT → LLM → TTS loop.

```typescript
import { createAgent } from '@milu/agent-core';

const agent = createAgent({
  businessId: 'biz_123',
  knowledgeBase: await getKnowledgeBase('biz_123'),
  onEscalate: (callId, summary) => escalateCall(callId, summary),
});

agent.on('transcript', (text) => console.log('Caller said:', text));
agent.on('response', (audio) => streamToCall(audio));
```

#### `packages/telephony`

Adapters for Africa's Talking and Twilio. Both implement the same `TelephonyProvider` interface so the agent core is provider-agnostic.

```typescript
import { AfricasTalkingProvider } from '@milu/telephony';

const provider = new AfricasTalkingProvider({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

provider.on('inbound', (call) => agent.handleCall(call));
```

---

## API Reference

Base URL: `http://localhost:4000/api/v1`

### Authentication

All dashboard and onboarding API routes require a JWT bearer token.

```http
Authorization: Bearer <token>
```

### Core Endpoints

#### Webhooks (public, signed)

```
POST /webhooks/at/voice          Africa's Talking inbound call event
POST /webhooks/at/media-stream   Africa's Talking audio stream
```

#### Business

```
GET  /businesses/:id             Get business profile
PUT  /businesses/:id             Update business config
GET  /businesses/:id/kb          Get knowledge base
PUT  /businesses/:id/kb          Update knowledge base
```

#### Calls

```
GET  /calls                      List calls (paginated, filterable)
GET  /calls/:id                  Get call detail + transcript
GET  /calls/:id/recording        Get call recording URL
```

#### Analytics

```
GET  /analytics/summary          Daily/weekly stats
GET  /analytics/intents          Top caller intents breakdown
GET  /analytics/resolution-rate  AI vs human resolution over time
```

#### Auth

```
POST /auth/register              Create account
POST /auth/login                 Get JWT token
POST /auth/refresh               Refresh token
POST /auth/logout                Invalidate token
```

---

## Database Schema

Key tables (see `packages/db/prisma/schema.prisma` for full schema):

```
businesses      — business accounts, config, subscription tier
phone_numbers   — linked phone numbers per business
knowledge_base  — FAQs and business info per business
calls           — call records (status, duration, resolution)
transcripts     — per-turn transcript entries linked to calls
escalations     — escalation events (timestamp, reason, summary)
users           — dashboard user accounts
```

---

## Configuration

### Knowledge Base Format

Business owners configure their agent via the dashboard. Internally this is stored as structured JSON:

```json
{
  "businessName": "QuickDelivery NG",
  "industry": "logistics",
  "operatingHours": {
    "weekdays": "08:00–20:00",
    "saturday": "09:00–18:00",
    "sunday": "closed"
  },
  "faqs": [
    {
      "question": "How much does delivery to Lekki cost?",
      "answer": "Delivery to Lekki Phase 1 and 2 is ₦4,500. Island Express locations are ₦3,800."
    }
  ],
  "escalationNumber": "+2348012345678",
  "voiceId": "el_voice_abc123"
}
```

### System Prompt Structure

The LLM system prompt is assembled per-call from:

1. Base agent persona (`prompts/base.txt`)
2. Business knowledge base (injected at runtime)
3. Active call context (caller history, current intent)

See `packages/agent-core/src/prompt-builder.ts` for the full assembly logic.

### Intent Detection

Milu classifies each caller turn into one of:

| Intent | Description |
|---|---|
| `faq` | General question answerable from KB |
| `booking` | Appointment or delivery booking request |
| `order_status` | Asking about an existing order |
| `complaint` | Issue or dissatisfaction |
| `escalate` | Explicit request for human |
| `unknown` | Low-confidence, triggers soft escalation |

---

## Testing

```bash
# Run all tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests (requires running DB + Redis)
pnpm test:integration

# E2E call simulation (requires all API keys)
pnpm test:e2e
```

### Simulating a Call Locally

Use the built-in call simulator to test the agent pipeline without a real phone line:

```bash
pnpm --filter @milu/api simulate-call \
  --business-id biz_123 \
  --audio ./test/fixtures/sample-call.wav
```

This runs the full STT → LLM → TTS pipeline and outputs a response audio file.

---

## Deployment

### Railway (recommended)

1. Connect your GitHub repo to Railway
2. Set all environment variables in the Railway dashboard
3. Railway auto-detects the monorepo and deploys each app as a separate service

### Docker

```bash
# Build all images
docker compose build

# Start all services
docker compose up -d

# View logs
docker compose logs -f api
```

The `docker-compose.yml` includes PostgreSQL and Redis containers for self-hosted deployments.

---

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes and write tests
3. Run `pnpm lint && pnpm test` — both must pass
4. Open a pull request with a clear description

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.

---

## Roadmap

- [x] Core voice agent pipeline (STT → LLM → TTS)
- [x] Africa's Talking telephony adapter
- [x] Business dashboard v1
- [x] Self-serve onboarding
- [ ] Yoruba and Hausa language support
- [ ] Twilio adapter (international)
- [ ] CRM webhooks (generic + HubSpot)
- [ ] Voice cloning for business owner's voice
- [ ] Outbound call campaigns
- [ ] WhatsApp channel (in addition to voice)

---

## License

MIT © 2026 Milu Technologies

---

> Built in Nigeria, for Africa. Questions? Open an issue or email **dev@milu.ai**
