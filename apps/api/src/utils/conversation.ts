/**
 * Chat message as sent to the OpenAI chat-completions API. Assistant messages
 * that request tools carry `tool_calls`; the results come back as `tool` role
 * messages keyed by `tool_call_id`.
 */
export type ChatHistoryMessage = {
  role: string;
  content?: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

/**
 * Drops the oldest messages until the history fits within `max`, mutating the
 * array in place, and returns how many were removed.
 *
 * The cut point must never land such that a `tool` result becomes the first
 * message: the API requires every tool result to be preceded by the assistant
 * message that requested it, and rejects the whole request otherwise — which on
 * a live call means the agent stops responding entirely. So the cut is advanced
 * past any leading tool results.
 *
 * Trimming only from the front is what makes this safe in the other direction:
 * an assistant message with `tool_calls` is always kept together with the tool
 * results that follow it.
 */
export function trimHistory(history: ChatHistoryMessage[], max: number): number {
  if (max <= 0 || history.length <= max) return 0;

  let drop = history.length - max;
  while (drop < history.length && history[drop]?.role === 'tool') {
    drop++;
  }

  if (drop <= 0) return 0;
  history.splice(0, drop);
  return drop;
}
