/**
 * Fast-path detection of genuine emergencies on a live call.
 *
 * This exists to skip the LLM round-trip when someone needs help *now*, so it
 * runs before the model sees the turn. That makes precision matter more than
 * recall: a false positive hangs up on a routine caller and fires an escalation
 * alert, while a false negative merely costs a second — the model is separately
 * instructed to call `escalate_to_human` for urgent needs, so it remains the
 * safety net.
 *
 * The previous implementation matched bare nouns (`police`, `emergency`,
 * `heart attack`), so "I'm calling about my police report" and "my dad had a
 * heart attack last year" both triggered an immediate transfer.
 *
 * The rule here: match only first-person / present-tense / imperative phrasings
 * that describe an emergency happening now, then suppress anything sitting in a
 * clearly administrative, past or hypothetical context.
 */

/**
 * Phrasings that describe an emergency in progress. Each requires more than a
 * bare noun — a verb, an imperative, or a present-progressive construction.
 */
const EMERGENCY_PATTERNS: RegExp[] = [
  // Breathing / unresponsive
  /\b(?:can'?t|cannot|couldn'?t)\s+breathe\b/i,
  /\b(?:is|are|'s)?\s*(?:not|isn'?t|ain'?t)\s+breathing\b/i,
  /\b(?:not|no longer)\s+(?:responding|conscious)\b/i,
  /\b(?:passed|passing)\s+out\b/i,

  // Acute medical, happening now
  /\b(?:is|am|'s|having)\s+(?:a\s+)?(?:heart attack|stroke|seizure)\b/i,
  /\bhaving\s+(?:a\s+)?(?:heart attack|stroke|seizure)\b/i,
  /\bbleeding\s+(?:badly|heavily|a lot|out)\b/i,
  /\b(?:is|'s|are)\s+dying\b/i,
  /\b(?:she|he|they|someone|somebody|my \w+)\s+(?:just\s+)?collapsed\b/i,

  // Requests for emergency services
  /\b(?:call|send|get|need|want)\s+(?:me\s+)?(?:an?\s+|the\s+)?(?:ambulance|paramedics?)\b/i,
  /\b(?:call|send|get)\s+(?:me\s+)?(?:the\s+)?police\b/i,
  /\b(?:call|send|get)\s+(?:the\s+)?fire\s+(?:service|brigade|department)\b/i,

  // Fire / crime in progress
  /\bthere(?:'s| is)\s+a\s+fire\b/i,
  /\b(?:house|building|shop|car)\s+is\s+on\s+fire\b/i,
  /\bbeing\s+(?:robbed|attacked|kidnapped|assaulted)\b/i,
  /\b(?:armed\s+robbers?|kidnappers?)\s+(?:are|dey|is)\b/i,
  /\bsomeone\s+(?:has\s+)?broke(?:n)?\s+in(?:to)?\b/i,

  // Explicit declarations
  /\b(?:it'?s|this is|we have|i have)\s+(?:an?\s+)?(?:real\s+)?emergency\b/i,
  /\b(?:it'?s|this is)\s+life[\s-]threatening\b/i,

  // Nigerian Pidgin — common phrasings for the same situations
  /\be\s+no\s+dey\s+breathe\b/i,
  /\bdem\s+(?:wan|don)\s+kill\b/i,
  /\bhelp\s+me\s+now\s+now\b/i,
  /\bna\s+emergency\b/i,
];

/**
 * Contexts that make an emergency word administrative, historical or
 * hypothetical rather than live. Any of these suppresses the fast path and
 * hands the turn to the model, which can read the situation properly.
 */
const SUPPRESSING_CONTEXT: RegExp[] = [
  // Paperwork and enquiries
  /\b(?:report|certificate|form|claim|policy|insurance|invoice|receipt|record)\b/i,
  /\bemergency\s+(?:exit|contact|number|kit|plan|procedure|services\s+number)\b/i,
  /\b(?:do|does|did)\s+you\s+(?:have|offer|cover|handle)\b/i,

  // Past tense / retrospective
  /\b(?:last|past)\s+(?:year|week|month|night|time)\b/i,
  /\b(?:yesterday|previously|used to|back then)\b/i,
  /\b\d+\s+(?:days?|weeks?|months?|years?)\s+ago\b/i,
  /\b(?:had|has had|have had)\s+(?:a|an)\b/i,

  // Hypothetical
  /\b(?:if|in case of|what if|suppose|whenever)\b/i,
];

/**
 * True when the caller appears to be describing an emergency in progress.
 *
 * Conservative by design — see the module comment. When this returns false the
 * turn proceeds to the LLM as normal, which can still escalate.
 */
export function isEmergency(text: string): boolean {
  const input = (text ?? '').trim();
  if (input.length < 3) return false;

  const matched = EMERGENCY_PATTERNS.some(p => p.test(input));
  if (!matched) return false;

  // A live emergency and an administrative mention can't both be true; prefer
  // handing ambiguous turns to the model rather than hanging up on the caller.
  if (SUPPRESSING_CONTEXT.some(p => p.test(input))) return false;

  return true;
}
