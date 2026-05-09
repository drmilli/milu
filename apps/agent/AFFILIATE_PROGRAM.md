# Milu Affiliate (Agent) Web App — Spec

## Goal
Create an “Affiliate Agent” web app where agents can:
- Sign up / log in
- See their dashboard (earnings, referred businesses, status)
- Get a referral link (and QR code) to invite businesses/companies
- Earn a commission on subscription payments made by referred businesses
- Request withdrawals (bank transfer)

Admin can:
- Manage affiliate agents (approve/suspend/ban, edit commission settings)
- See all businesses referred by each agent
- View and act on withdrawal requests

## Roles
- **Affiliate Agent**: external partner who invites businesses and earns commissions.
- **Milu Admin**: internal team; can manage agents, referrals, commissions, withdrawals.
- **Business**: the invited customer who registers and subscribes.

## Notifications (Email)
Affiliate agents should receive email notifications for key events:
- **Account events**: successful signup (welcome email), password reset, email verification (if enabled)
- **Referral events**: a business signs up using their referral code, a referred business becomes an active subscriber
- **Earnings events**: commission credited for a payment, commission reversed/adjusted
- **Withdrawal events**: withdrawal requested (confirmation), approved, paid (with payout reference), rejected (with reason)
- **Admin actions**: agent suspended/unsuspended/banned, commission % or eligibility window updated

## Commission Rules
- Default commission: **15%** of subscription payments.
- Admin can edit:
  - Commission percentage (global default and/or per-agent override)
  - Eligibility duration (default: **12 months** from first successful payment, per referral)
- Commission applies to:
  - Recurring monthly subscription payments made by the referred business.
- Commission should stop when:
  - 12-month eligibility window ends, or
  - agent is suspended/banned (policy decision below), or
  - business subscription is cancelled / no successful payment.

**Policy defaults**
- **Suspended**: agent cannot withdraw; new referrals blocked; commissions may continue accruing but remain locked.
- **Banned**: agent cannot withdraw; referral link disabled; commissions stop accruing from ban time.

## Referral Link + Attribution
### Referral identifier
- Each affiliate agent gets a stable **referral code** (e.g., `AGT_8H2K9Q`).
- Referral link format:
  - `https://dashboard.miluai.app/register?ref=AGT_8H2K9Q`
  - (or `https://miluai.app/pricing?ref=AGT_8H2K9Q` if marketing flow starts on website)

### Attribution rules
- When a business registers with `ref`, store:
  - `business.affiliateAgentId`
  - `business.affiliateReferralCode`
  - `business.affiliateReferredAt`
- First-touch vs last-touch:
  - Default: **first-touch** (first referral code used at signup is locked in).
  - If business already has an agent assigned, ignore future `ref` codes.

## Agent App (Affiliate dashboard) — Pages
### Auth
- `/signup`
  - Full name
  - Email
  - Password
  - Phone (optional)
  - Country (optional)
  - Agreement checkbox
- `/login`
- `/forgot-password` (optional)

### Dashboard
- Summary cards:
  - Total referred businesses
  - Active referred subscribers
  - Total earned (lifetime)
  - Eligible earnings (available to withdraw)
  - Pending withdrawals
- Referral tools:
  - Referral link (copy)
  - QR code (download PNG/SVG)
  - Optional: UTM builder (source/medium/campaign)

### Referrals
- Table:
  - Business name
  - Date joined
  - Current plan
  - Subscription status
  - Total paid
  - Commission earned (lifetime)
  - Commission eligibility end date

### Earnings / Commissions
- Ledger view:
  - Date
  - Business
  - Payment reference (invoice/transaction id)
  - Amount paid
  - Commission %
  - Commission amount
  - Status: pending/confirmed/reversed/locked

### Withdrawals
- Bank details (saved profile):
  - Account name
  - Account number
  - Bank name
  - Country
- Request withdrawal:
  - Amount
  - Destination bank details
  - Notes
- Withdrawal history:
  - Requested at
  - Amount
  - Status: NEW / APPROVED / PAID / REJECTED
  - Admin note / payout reference

### Settings
- Profile update
- Password change
- Bank details update

## Admin (Affiliate management) — Pages/Features
### Agents list
- Search/filter by status
- Columns: name, email, referral code, status, joined, referred businesses, earned, available balance
- Actions:
  - Suspend / Unsuspend
  - Ban
  - Edit commission % (override) and eligibility months (override)

### Agent detail
- Profile + status
- Referral link + QR preview
- Referred businesses list
- Commissions ledger for that agent
- Withdrawals list for that agent

### Withdrawals queue
- List all withdrawal requests
- Actions:
  - Approve (locks funds)
  - Mark as paid (store payout reference)
  - Reject (unlock funds)
- Optional: export CSV

## Backend / Data Model (high-level)
### Tables (proposed)
- `affiliate_agents`
  - `id`, `name`, `email`, `passwordHash`, `referralCode`
  - `status` (ACTIVE/SUSPENDED/BANNED)
  - `commissionPercent` (nullable override)
  - `commissionMonths` (nullable override)
  - `createdAt`, `updatedAt`
- `affiliate_referrals`
  - `id`, `affiliateAgentId`, `businessId`
  - `referredAt`
  - `lockedAttribution` (boolean)
  - `eligibilityEndsAt`
- `affiliate_commissions`
  - `id`, `affiliateAgentId`, `businessId`
  - `paymentId` (invoice/transaction reference)
  - `amountPaidUsd`
  - `commissionPercent`
  - `commissionAmountUsd`
  - `status` (PENDING/CONFIRMED/REVERSED/LOCKED)
  - `createdAt`
- `affiliate_withdrawal_requests`
  - `id`, `affiliateAgentId`
  - `amountUsd`
  - `bankDetailsSnapshot` (JSON)
  - `status` (NEW/APPROVED/PAID/REJECTED)
  - `adminNote`, `payoutReference`
  - `createdAt`, `updatedAt`
- `affiliate_settings`
  - singleton row: default `commissionPercent` (15), default `commissionMonths` (12)

### Core flows
1) **Business signup with referral**
   - On register, if `ref` is present and matches an ACTIVE agent:
     - create referral record, link business → agent, compute eligibility window
2) **Subscription payment occurs**
   - On each successful payment (monthly):
     - if business has referral and within eligibility window:
       - compute commission and create commission ledger row
3) **Withdrawal request**
   - Agent requests amount ≤ available balance
   - Create withdrawal request; mark associated funds as locked (or compute locked balance by status)

## Integrations / Notes
- Billing is currently handled via existing payment provider logic (e.g., Whop). Affiliate commissions should be derived from the same “payment success” event used to grant plan access.
- Commission currency: USD only (matches current billing direction).
- QR code generation:
  - Generate client-side in the Agent web app (no secrets), from the referral URL.

## Acceptance Criteria
- Agent can sign up/login and always sees their referral link + QR code.
- Admin can see agents, manage their status, and view which businesses they referred.
- Commissions are created from successful subscription payments and stop after 12 months.
- Agent can request withdrawal and admin can approve/mark paid/reject.
