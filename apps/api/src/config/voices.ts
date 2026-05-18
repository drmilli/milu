export const ELEVENLABS_VOICES: Record<string, string> = {
  tiff: '6aDn1KB0hjpdcocrUkmq',
  mike: 'ewxUvnyvvOehYjKjUVKC',
  english: 'Wq15xSaY3gWvazBRaGEU',
};

export const DEFAULT_VOICE = 'tiff';

export function getElevenLabsVoiceId(voiceId: string | null | undefined): string | null {
  if (!voiceId) return null;
  return ELEVENLABS_VOICES[voiceId.toLowerCase().trim()] ?? null;
}
