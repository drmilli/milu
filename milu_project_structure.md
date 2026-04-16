# milu. — Full Project Structure

> AI voice customer service for African businesses.
> Brand colors: **Brown** `#5C3D2E` · **Warm Brown** `#7A5230` · **Cream** `#F5ECD7` · **Light Cream** `#FAF6EE` · **Dark Brown** `#3B2314`

---

## Monorepo Root

```
milu/
├── apps/
│   ├── api/                    # Backend — Node.js REST + WebSocket server
│   ├── admin/                  # Admin panel — internal ops dashboard
│   ├── dashboard/              # Business owner dashboard (Next.js)
│   └── website/                # Public landing page / marketing site
├── packages/
│   ├── agent-core/             # Voice pipeline: STT → LLM → TTS
│   ├── telephony/              # Africa's Talking + Twilio adapters
│   ├── db/                     # Shared Prisma schema + migrations
│   └── ui/                     # Shared component library (brown/cream theme)
├── docs/                       # Architecture docs, ADRs, API references
├── infra/                      # Railway / Docker configs
├── scripts/                    # Dev utilities, seed scripts, simulators
├── .env.example
├── docker-compose.yml
├── pnpm-workspace.yaml
└── README.md
```

---

## 1. Backend — `apps/api/`

> Node.js 20 + Express + TypeScript. Handles all inbound calls, LLM orchestration, and business logic.

```
apps/api/
├── src/
│   ├── index.ts                        # Entry point — starts HTTP + WebSocket server
│   ├── config/
│   │   ├── env.ts                      # Validated env vars (zod)
│   │   └── logger.ts                   # Pino logger config
│   │
│   ├── webhooks/
│   │   ├── at-voice.ts                 # Africa's Talking inbound call handler
│   │   ├── at-media-stream.ts          # Africa's Talking audio stream handler
│   │   └── signature.ts                # Webhook signature verification
│   │
│   ├── ws/
│   │   ├── call-socket.ts              # WebSocket server for live audio streams
│   │   └── session-manager.ts          # Manages active call sessions in Redis
│   │
│   ├── routes/
│   │   ├── auth.ts                     # POST /auth/register, login, refresh, logout
│   │   ├── businesses.ts               # GET/PUT /businesses/:id + KB routes
│   │   ├── calls.ts                    # GET /calls, /calls/:id, /calls/:id/recording
│   │   ├── analytics.ts                # GET /analytics/summary, intents, resolution-rate
│   │   ├── phone-numbers.ts            # GET/POST /phone-numbers (link numbers to business)
│   │   └── admin.ts                    # Internal admin-only routes (protected)
│   │
│   ├── middleware/
│   │   ├── auth.ts                     # JWT verification middleware
│   │   ├── admin-guard.ts              # Restrict routes to admin role
│   │   ├── rate-limit.ts               # Express rate limiter
│   │   └── error-handler.ts            # Global error handler
│   │
│   ├── services/
│   │   ├── call.service.ts             # Call lifecycle: create, update, close
│   │   ├── business.service.ts         # Business CRUD + KB management
│   │   ├── analytics.service.ts        # Stats aggregation queries
│   │   ├── escalation.service.ts       # Trigger escalation + send WhatsApp alert
│   │   ├── notification.service.ts     # WhatsApp + email notifications
│   │   └── recording.service.ts        # Store + retrieve call recordings
│   │
│   ├── agent/
│   │   ├── runner.ts                   # Orchestrates agent-core per call
│   │   ├── prompt-builder.ts           # Assembles Claude system prompt from KB
│   │   └── intent-classifier.ts        # Maps transcript to intent enum
│   │
│   └── utils/
│       ├── jwt.ts
│       ├── redis.ts
│       └── phone.ts                    # Phone number formatting helpers
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│       └── sample-call.wav
│
├── tsconfig.json
└── package.json
```

### Key API Routes

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/webhooks/at/voice` | Africa's Talking inbound call event |
| `POST` | `/webhooks/at/media-stream` | Africa's Talking audio stream |
| `POST` | `/auth/register` | Create business account |
| `POST` | `/auth/login` | Get JWT token |
| `GET` | `/businesses/:id` | Get business profile |
| `PUT` | `/businesses/:id/kb` | Update knowledge base |
| `GET` | `/calls` | List calls (paginated) |
| `GET` | `/calls/:id` | Call detail + transcript |
| `GET` | `/analytics/summary` | Daily / weekly stats |
| `GET` | `/analytics/intents` | Top caller intents |

---

## 2. Admin Panel — `apps/admin/`

> Next.js 14 internal dashboard for the Milu ops team. Brown/cream themed. Protected by admin role JWT.

```
apps/admin/
├── app/
│   ├── layout.tsx                      # Root layout with sidebar + auth check
│   ├── page.tsx                        # Redirect → /dashboard
│   │
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx                # Admin login page
│   │
│   ├── dashboard/
│   │   └── page.tsx                    # Overview: total businesses, calls today, revenue
│   │
│   ├── businesses/
│   │   ├── page.tsx                    # Table: all businesses, search, filter by tier
│   │   ├── [id]/
│   │   │   ├── page.tsx                # Business detail: profile, KB, call history
│   │   │   └── edit/page.tsx           # Edit business config / subscription tier
│   │   └── new/page.tsx                # Manually create a business account
│   │
│   ├── calls/
│   │   ├── page.tsx                    # All calls across all businesses
│   │   └── [id]/page.tsx               # Call detail: transcript, recording, escalation log
│   │
│   ├── analytics/
│   │   └── page.tsx                    # Platform-wide: total calls, resolution rate, MRR
│   │
│   ├── users/
│   │   ├── page.tsx                    # List all admin + business owner accounts
│   │   └── [id]/page.tsx               # User detail: role, linked business, activity
│   │
│   ├── phone-numbers/
│   │   └── page.tsx                    # Manage provisioned numbers, link to businesses
│   │
│   └── settings/
│       └── page.tsx                    # Platform config: pricing tiers, feature flags
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                 # Navigation sidebar (brown bg, cream text)
│   │   ├── TopBar.tsx                  # Page header with admin user info
│   │   └── PageWrapper.tsx
│   │
│   ├── tables/
│   │   ├── BusinessTable.tsx
│   │   ├── CallTable.tsx
│   │   └── UserTable.tsx
│   │
│   ├── cards/
│   │   ├── StatCard.tsx                # Metric card (cream bg, brown accent)
│   │   └── AlertCard.tsx
│   │
│   └── shared/
│       ├── Badge.tsx                   # Status badges (resolved, escalated, etc.)
│       ├── SearchInput.tsx
│       └── ConfirmModal.tsx
│
├── lib/
│   ├── api.ts                          # Typed fetch wrapper for backend API
│   ├── auth.ts                         # Admin session helpers (NextAuth or custom JWT)
│   └── utils.ts
│
├── styles/
│   └── globals.css                     # Brown/cream CSS variables + Tailwind theme
│
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

### Admin Color Tokens

```css
/* styles/globals.css */
:root {
  --color-primary:        #5C3D2E;   /* Deep brown — sidebar, buttons */
  --color-primary-dark:   #3B2314;   /* Dark brown — hover states */
  --color-primary-warm:   #7A5230;   /* Warm brown — accents */
  --color-cream:          #F5ECD7;   /* Cream — page background */
  --color-cream-light:    #FAF6EE;   /* Light cream — card backgrounds */
  --color-cream-dark:     #EAD9BA;   /* Muted cream — borders, dividers */
  --color-text-primary:   #3B2314;   /* Dark brown — headings */
  --color-text-secondary: #7A5230;   /* Warm brown — subtext */
  --color-text-inverse:   #FAF6EE;   /* Cream — text on dark backgrounds */
  --color-success:        #4A7C59;   /* Muted green */
  --color-warning:        #C97D2E;   /* Amber-brown */
  --color-danger:         #A63C2E;   /* Muted red-brown */
}
```

---

## 3. Business Owner Dashboard — `apps/dashboard/`

> Next.js 14 app for business owners. View calls, manage knowledge base, monitor performance.

```
apps/dashboard/
├── app/
│   ├── layout.tsx                      # Root layout with sidebar + auth
│   ├── page.tsx                        # Redirect → /overview
│   │
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx           # Redirect to onboarding after signup
│   │
│   ├── overview/
│   │   └── page.tsx                    # Today's calls, resolution rate, top intents
│   │
│   ├── calls/
│   │   ├── page.tsx                    # Call history: filter by date, intent, resolution
│   │   └── [id]/page.tsx               # Call detail: transcript, AI turns, recording
│   │
│   ├── knowledge-base/
│   │   ├── page.tsx                    # View + edit FAQs, business hours, escalation #
│   │   └── edit/page.tsx               # Form to update KB entries
│   │
│   ├── agent/
│   │   └── page.tsx                    # Agent settings: voice selection, persona tone
│   │
│   ├── analytics/
│   │   └── page.tsx                    # Resolution rate, avg call duration, intent chart
│   │
│   ├── phone-numbers/
│   │   └── page.tsx                    # View linked numbers, request new number
│   │
│   ├── notifications/
│   │   └── page.tsx                    # Configure WhatsApp / email alert preferences
│   │
│   └── settings/
│       └── page.tsx                    # Account: plan, billing, password
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   └── MobileNav.tsx
│   │
│   ├── calls/
│   │   ├── CallList.tsx
│   │   ├── CallCard.tsx
│   │   ├── TranscriptViewer.tsx        # Turn-by-turn transcript display
│   │   └── IntentBadge.tsx
│   │
│   ├── kb/
│   │   ├── FAQEditor.tsx               # Add / edit / delete FAQ entries
│   │   ├── HoursEditor.tsx             # Operating hours picker
│   │   └── KBPreview.tsx               # Preview how agent uses the KB
│   │
│   ├── analytics/
│   │   ├── ResolutionChart.tsx         # AI vs human resolution over time
│   │   ├── IntentBreakdown.tsx         # Donut or bar chart of intents
│   │   └── StatRow.tsx
│   │
│   └── shared/
│       ├── EmptyState.tsx
│       ├── LoadingSkeleton.tsx
│       └── Avatar.tsx
│
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   └── formatters.ts                   # Duration, date, phone formatting
│
├── styles/
│   └── globals.css                     # Same brown/cream design tokens
│
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## 4. Public Website (Landing Page) — `apps/website/`

> Next.js 14 marketing site. Brown and cream palette. Conversion-focused with waitlist / signup CTA.

```
apps/website/
├── app/
│   ├── layout.tsx                      # Root: Navbar + Footer
│   ├── page.tsx                        # Home / landing page
│   │
│   ├── pricing/
│   │   └── page.tsx                    # Pricing tiers: Starter, Growth, Enterprise
│   │
│   ├── features/
│   │   └── page.tsx                    # Deep-dive on voice AI, KB, analytics, escalation
│   │
│   ├── about/
│   │   └── page.tsx                    # Built in Nigeria, for Africa — origin story
│   │
│   ├── blog/
│   │   ├── page.tsx                    # Blog index
│   │   └── [slug]/page.tsx             # Blog post (MDX)
│   │
│   ├── contact/
│   │   └── page.tsx                    # Contact form + WhatsApp link
│   │
│   └── legal/
│       ├── privacy/page.tsx
│       └── terms/page.tsx
│
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx                  # Logo left, nav links, "Get Started" CTA
│   │   └── Footer.tsx                  # Links, socials, "Built in Nigeria" note
│   │
│   ├── sections/                       # Landing page sections (assembled in app/page.tsx)
│   │   ├── Hero.tsx                    # Headline, subheadline, CTA, phone mockup
│   │   ├── SocialProof.tsx             # Business logos / customer quotes
│   │   ├── HowItWorks.tsx              # 3-step: customer calls → AI answers → you review
│   │   ├── Features.tsx                # Feature grid: FAQs, bookings, escalation, analytics
│   │   ├── DemoCallPlayer.tsx          # Embedded audio demo of a real AI call
│   │   ├── Pricing.tsx                 # Pricing cards
│   │   ├── Testimonials.tsx            # Quotes from Nigerian / African business owners
│   │   ├── AfricaFocus.tsx             # Languages, local networks (AT), local context
│   │   └── CTABanner.tsx               # Final CTA: "Start your free trial"
│   │
│   ├── ui/
│   │   ├── Button.tsx                  # Primary (brown), secondary (cream outline)
│   │   ├── Card.tsx                    # Cream card with brown border accent
│   │   ├── Badge.tsx
│   │   ├── Input.tsx
│   │   └── Section.tsx                 # Page section wrapper with padding
│   │
│   └── blog/
│       ├── PostCard.tsx
│       └── MDXComponents.tsx
│
├── content/
│   └── blog/                           # MDX blog posts
│       ├── why-african-businesses-miss-calls.mdx
│       └── ai-voice-agents-explained.mdx
│
├── public/
│   ├── images/
│   │   ├── logo.svg
│   │   ├── logo-dark.svg               # Cream logo for dark backgrounds
│   │   ├── hero-phone-mockup.png
│   │   └── og-image.png                # Open Graph image
│   └── fonts/
│
├── styles/
│   └── globals.css
│
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

### Website Design System

```
Typography
──────────
Headings      — Playfair Display (serif) in Dark Brown #3B2314
Body          — Inter (sans-serif) in #5C3D2E
Accent text   — Inter Medium in Warm Brown #7A5230

Palette
──────────────────────────────────────────────────────────────
Deep Brown      #5C3D2E    Primary buttons, navbar background
Dark Brown      #3B2314    H1/H2 headings, footer background
Warm Brown      #7A5230    Links, icon fills, hover states
Cream           #F5ECD7    Hero background, section alternates
Light Cream     #FAF6EE    Card backgrounds, inputs
Muted Cream     #EAD9BA    Borders, dividers, subtle UI lines
White           #FFFFFF    CTA contrast sections

Spacing scale: 4 / 8 / 16 / 24 / 32 / 48 / 64 / 96 / 128 px
Border radius:  sm=4px  md=8px  lg=16px  pill=9999px
```

---

## 5. Shared Packages

### `packages/agent-core/`

```
agent-core/
├── src/
│   ├── index.ts                        # createAgent() factory export
│   ├── pipeline.ts                     # STT → LLM → TTS orchestration loop
│   ├── stt/
│   │   └── deepgram.ts                 # Deepgram streaming client
│   ├── llm/
│   │   ├── claude.ts                   # Anthropic Claude API client
│   │   └── prompt-builder.ts           # Assembles system prompt from KB + context
│   ├── tts/
│   │   └── elevenlabs.ts               # ElevenLabs streaming TTS client
│   ├── intent.ts                       # Intent classification (faq, booking, escalate…)
│   └── types.ts                        # Shared types: Call, Turn, Intent, KB
└── package.json
```

### `packages/telephony/`

```
telephony/
├── src/
│   ├── index.ts
│   ├── provider.interface.ts           # TelephonyProvider interface
│   ├── africas-talking/
│   │   ├── provider.ts                 # AfricasTalkingProvider implements TelephonyProvider
│   │   └── xml-builder.ts              # Builds AT Voice XML responses
│   └── twilio/
│       └── provider.ts                 # TwilioProvider (roadmap)
└── package.json
```

### `packages/db/`

```
db/
├── prisma/
│   ├── schema.prisma                   # Full schema (see below)
│   └── migrations/
├── src/
│   ├── client.ts                       # Singleton PrismaClient export
│   └── seed.ts                         # Demo business data seed
└── package.json
```

**Core schema tables:**

| Table | Purpose |
|-------|---------|
| `businesses` | Business accounts, config, subscription tier |
| `phone_numbers` | Phone numbers linked per business |
| `knowledge_base` | FAQs and business info per business |
| `calls` | Call records: status, duration, resolution |
| `transcripts` | Per-turn transcript entries per call |
| `escalations` | Escalation events: timestamp, reason, summary |
| `users` | Dashboard user accounts (owner + admin roles) |

### `packages/ui/`

```
ui/
├── src/
│   ├── tokens.ts                       # Design tokens (brown/cream palette)
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Badge.tsx
│   ├── Input.tsx
│   ├── Modal.tsx
│   ├── Table.tsx
│   └── index.ts                        # Barrel export
└── package.json
```

---

## 6. Infrastructure — `infra/`

```
infra/
├── railway/
│   ├── api.railway.toml
│   ├── dashboard.railway.toml
│   ├── admin.railway.toml
│   └── website.railway.toml
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.dashboard
│   ├── Dockerfile.admin
│   └── Dockerfile.website
└── docker-compose.yml                  # PostgreSQL + Redis + all apps
```

### Service URLs (development)

| Service | URL |
|---------|-----|
| API | http://localhost:4000 |
| Dashboard | http://localhost:3000 |
| Admin Panel | http://localhost:3002 |
| Website | http://localhost:3003 |
| Onboarding | http://localhost:3001 |

---

## 7. Environment Variables

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

# Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_api_key

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=default_voice_id

# WhatsApp
WHATSAPP_TOKEN=your_whatsapp_business_token
WHATSAPP_PHONE_ID=your_phone_number_id

# App
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
ADMIN_URL=http://localhost:3002
WEBSITE_URL=http://localhost:3003
JWT_SECRET=change_this_in_production
ADMIN_JWT_SECRET=change_this_in_production
```

---

## 8. Scripts & Developer Tooling

```
scripts/
├── simulate-call.ts                    # Run STT→LLM→TTS without a real phone line
├── seed-demo.ts                        # Seed demo business + calls
└── provision-number.ts                 # Register a phone number with Africa's Talking
```

```bash
# Simulate a full call pipeline locally
pnpm --filter @milu/api simulate-call \
  --business-id biz_123 \
  --audio ./test/fixtures/sample-call.wav

# Run all tests
pnpm test

# Lint + type-check everything
pnpm lint && pnpm typecheck

# DB migrations
pnpm --filter @milu/db db:migrate
pnpm --filter @milu/db db:seed
```

---

*Built in Nigeria, for Africa. — milu.ai*
