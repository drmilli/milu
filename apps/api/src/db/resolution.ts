import { sql, type SQL } from 'drizzle-orm';
import { calls, transcripts } from './schema';

/**
 * Resolution for a call that ended on its own — the caller hung up, or the media
 * stream stopped — rather than being deliberately closed by the agent
 * (`end_call`) or handed to a human (escalation), both of which set their own
 * resolution and are unambiguous.
 *
 * A call only counts as AI-resolved when the AI actually handled something:
 *
 *   - the caller spoke at least once, AND
 *   - the agent produced at least two turns — its opening greeting is stored as
 *     an agent transcript, so a second turn means it genuinely replied to the
 *     caller rather than just answering the phone.
 *
 * Everything else is ABANDONED: silent hang-ups, wrong numbers, callers who
 * drop during the greeting, and calls where the agent never managed a reply.
 *
 * This matters because `aiResolutionRate` is the headline analytics number.
 * Recording every completed call as 'AI' pinned it near 100% regardless of what
 * actually happened on the call, which made it useless as a quality signal.
 *
 * Evaluated inside the UPDATE so it stays atomic and needs no extra round-trip.
 */
export function resolutionOnHangup(): SQL<string> {
  return sql`CASE
    WHEN (SELECT count(*) FROM ${transcripts} WHERE ${transcripts.callId} = ${calls.id} AND ${transcripts.speaker} = 'caller') >= 1
     AND (SELECT count(*) FROM ${transcripts} WHERE ${transcripts.callId} = ${calls.id} AND ${transcripts.speaker} = 'agent') >= 2
    THEN 'AI'::resolution_type
    ELSE 'ABANDONED'::resolution_type
  END`;
}
