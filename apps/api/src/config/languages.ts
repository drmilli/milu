/**
 * Languages the agent can be configured with, and what each one actually means
 * for speech-to-text.
 *
 * Deepgram is the binding constraint. Its nova-2 model covers most European and
 * Asian languages but NOT Arabic; nova-3 adds Arabic. No Deepgram model
 * transcribes Yoruba, Igbo, Hausa or Swahili. A language with `stt: null`
 * therefore cannot be understood on a call at all — the agent would be replying
 * to mistranscribed English.
 *
 * This registry is the single source of truth: the STT client reads it to pick a
 * model, the API exposes it so the dashboard cannot drift from it, and unsupported
 * languages are surfaced to the user as unavailable rather than silently ignored.
 *
 * Source: https://developers.deepgram.com/docs/models-languages-overview
 * nova-2 languages: bg ca zh cs da nl en et fi fr de el hi hu id it ja ko lv lt
 *                   ms no pl pt ro ru sk es sv th tr uk vi multi
 * nova-3 adds Arabic (and its regional variants).
 */

export type SttEngine = 'deepgram' | 'elevenlabs';

export type SttConfig = {
  /** Which provider transcribes this language. */
  engine: SttEngine;
  /** Provider model name. */
  model: string;
  /** Provider language code. */
  language: string;
};

export type AgentLanguage = {
  code: string;
  label: string;
  /** Deepgram configuration, or null when no model can transcribe this language. */
  stt: SttConfig | null;
  /** Shown in the dashboard when STT does not run in the language's own model. */
  note?: string;
  /**
   * Rough transcription quality, used to warn the operator.
   *
   * Vendor figures are measured on clean 16 kHz read speech; phone calls are
   * 8 kHz and spontaneous, so real accuracy is lower again. 'moderate' means
   * usable for simple exchanges but unreliable for taking orders verbatim.
   */
  accuracy?: 'good' | 'moderate';
  /**
   * Whether the agent can REPLY in this language.
   *
   * Understanding and speaking are separate capabilities. ElevenLabs Scribe
   * transcribes Yoruba, Igbo, Hausa and Swahili, but the realtime TTS model
   * (eleven_flash_v2_5, the only one that emits ulaw_8000 at telephony latency)
   * covers none of them. For those languages the agent understands the caller
   * and answers in English — which is a real, usable behaviour in West Africa,
   * and strictly better than not understanding them at all.
   *
   * Flip this to true per language the moment a realtime voice exists for it;
   * nothing else needs to change.
   */
  canSpeak: boolean;
};

export const AGENT_LANGUAGES: readonly AgentLanguage[] = [
  {
    code: 'en',
    label: 'English',
    stt: { engine: 'deepgram', model: 'nova-2', language: 'en' },
    canSpeak: true,
  },
  {
    code: 'pcm',
    label: 'Nigerian Pidgin',
    stt: { engine: 'deepgram', model: 'nova-2', language: 'en' },
    note: 'Transcribed with the English model — Pidgin is English-lexified, so this works well in practice. The agent replies in Pidgin.',
    canSpeak: true,
  },
  {
    code: 'ar',
    label: 'Arabic (العربية)',
    // Arabic is not in nova-2's language set; nova-3 is required.
    stt: { engine: 'deepgram', model: 'nova-3', language: 'ar' },
    canSpeak: true,
  },
  {
    code: 'fr',
    label: 'French',
    stt: { engine: 'deepgram', model: 'nova-2', language: 'fr' },
    canSpeak: true,
  },
  // Deepgram has no model for these; ElevenLabs Scribe v2 Realtime does.
  // `canSpeak: false` — no realtime ElevenLabs voice covers them yet, so the
  // agent understands the caller and replies in English.
  {
    code: 'ha', label: 'Hausa', accuracy: 'good', canSpeak: false,
    stt: { engine: 'elevenlabs', model: 'scribe_v2_realtime', language: 'ha' },
  },
  {
    code: 'yo', label: 'Yoruba', accuracy: 'moderate', canSpeak: false,
    stt: { engine: 'elevenlabs', model: 'scribe_v2_realtime', language: 'yo' },
  },
  {
    code: 'ig', label: 'Igbo', accuracy: 'moderate', canSpeak: false,
    stt: { engine: 'elevenlabs', model: 'scribe_v2_realtime', language: 'ig' },
  },
  {
    code: 'sw', label: 'Swahili', accuracy: 'moderate', canSpeak: false,
    stt: { engine: 'elevenlabs', model: 'scribe_v2_realtime', language: 'sw' },
  },
] as const;

const BY_CODE = new Map(AGENT_LANGUAGES.map(l => [l.code, l]));

/** Used when a language has no STT model, or the configured code is unknown. */
const FALLBACK_STT: SttConfig = { engine: 'deepgram', model: 'nova-2', language: 'en' };

export function getAgentLanguage(code: string | null | undefined): AgentLanguage | undefined {
  return BY_CODE.get((code ?? '').trim());
}

/** Every code the API will accept, including the not-yet-transcribable ones. */
export function knownLanguageCodes(): string[] {
  return AGENT_LANGUAGES.map(l => l.code);
}

/** True when calls in this language can actually be transcribed. */
export function isTranscribable(code: string | null | undefined): boolean {
  return !!getAgentLanguage(code)?.stt;
}

/**
 * Resolves the Deepgram model and language for a configured agent language.
 *
 * `exact` is false when the caller will be transcribed in something other than
 * the configured language — either because no model supports it, or because the
 * code is unrecognised. Callers should log that rather than proceeding silently.
 */
export function resolveSttConfig(code: string | null | undefined): {
  stt: SttConfig;
  exact: boolean;
  requested: string;
} {
  const requested = (code ?? 'en').trim() || 'en';
  const entry = getAgentLanguage(requested);

  if (entry?.stt) {
    // Pidgin is deliberately transcribed as English — that is the intended
    // configuration, not a silent downgrade.
    return { stt: entry.stt, exact: true, requested };
  }

  return { stt: FALLBACK_STT, exact: false, requested };
}

/** True when the agent can reply in this language, not just understand it. */
export function canSpeak(code: string | null | undefined): boolean {
  return !!getAgentLanguage(code)?.canSpeak;
}

/** Human-readable name for prompts and UI copy. */
export function languageLabel(code: string | null | undefined): string {
  return getAgentLanguage(code)?.label ?? 'English';
}
