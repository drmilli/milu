import { sql, type SQL } from 'drizzle-orm';
import { calls } from './schema';

/**
 * Duration, in whole seconds, for a call being marked complete.
 *
 * Preserves any authoritative value already stored — Twilio's `CallDuration` on
 * the gather path, Africa's Talking's `durationInSeconds` — and otherwise derives
 * wall-clock seconds from `started_at`, which is stamped when the call is
 * answered. The streaming path has no provider-supplied duration to work from
 * (the `calls` table stores no CallSid to match a status callback against), so
 * this is what fills the column there.
 *
 * Evaluated inside the UPDATE so it is atomic and costs no extra round-trip.
 */
export function callDurationSeconds(): SQL<number> {
  return sql<number>`COALESCE(${calls.duration}, GREATEST(0, EXTRACT(EPOCH FROM (now() - ${calls.startedAt}))::int))`;
}
