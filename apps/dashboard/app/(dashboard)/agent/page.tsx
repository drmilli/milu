'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPut } from '../../../lib/api';

interface AgentConfig {
  name: string;
  tone: string;
  greeting?: string;
  fallbackMessage?: string;
  voiceId?: string;
  enableRecording: boolean;
  enableTranscription: boolean;
  businessHoursOnly: boolean;
  afterHoursMessage?: string;
}

const VOICES = [
  { id: 'amaka', name: 'Amaka', desc: 'Warm, friendly — great for retail' },
  { id: 'chidi', name: 'Chidi', desc: 'Calm, professional — great for services' },
  { id: 'ngozi', name: 'Ngozi', desc: 'Energetic, upbeat — great for hospitality' },
];

const TONES = ['professional', 'friendly', 'concise', 'empathetic', 'formal'];

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

export default function AgentPage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [config, setConfig] = useState<AgentConfig>({
    name: 'Milu',
    tone: 'friendly',
    greeting: "Hello, you've reached {businessName}. I'm Milu, your AI assistant. How can I help you today?",
    voiceId: 'amaka',
    enableRecording: true,
    enableTranscription: true,
    businessHoursOnly: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token || !businessId) return;
    apiGet<AgentConfig>(`/agent/${businessId}`, token)
      .then(data => setConfig(data))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      await apiPut(`/agent/${businessId}`, config, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) {
    setConfig(prev => ({ ...prev, [k]: v }));
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Agent Setup</h1>
        <p className="text-sm text-primary-warm mt-0.5">Customise how your AI agent sounds and behaves.</p>
      </div>

      {/* Voice */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <h2 className="font-semibold text-primary-dark mb-1">Voice</h2>
        <p className="text-xs text-primary-warm mb-4">Choose the voice your agent uses on calls.</p>
        {loading ? <Skeleton className="h-36" /> : (
          <div className="space-y-2.5">
            {VOICES.map(v => (
              <label key={v.id} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                config.voiceId === v.id ? 'border-primary/40 bg-primary/4' : 'border-cream-dark hover:border-cream-dark/80'
              }`}>
                <input type="radio" name="voice" value={v.id} checked={config.voiceId === v.id}
                  onChange={() => set('voiceId', v.id)} className="accent-primary w-4 h-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary-dark">{v.name}</p>
                  <p className="text-xs text-primary-warm">{v.desc}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Tone */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <h2 className="font-semibold text-primary-dark mb-1">Tone</h2>
        <p className="text-xs text-primary-warm mb-4">How your agent communicates.</p>
        {loading ? <Skeleton className="h-10" /> : (
          <div className="flex flex-wrap gap-2">
            {TONES.map(t => (
              <button key={t} onClick={() => set('tone', t)}
                className={`px-4 py-2 rounded-full text-sm font-medium border capitalize transition-colors ${
                  config.tone === t
                    ? 'bg-primary text-cream-light border-primary'
                    : 'bg-cream text-primary-warm border-cream-dark hover:border-primary/30'
                }`}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Greeting */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <h2 className="font-semibold text-primary-dark mb-1">Greeting script</h2>
        <p className="text-xs text-primary-warm mb-4">
          What the agent says at the start of every call.{' '}
          <span className="text-primary">{'{businessName}'}</span> is replaced automatically.
        </p>
        {loading ? <Skeleton className="h-24" /> : (
          <textarea rows={4}
            className="w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
            value={config.greeting ?? ''}
            onChange={e => set('greeting', e.target.value)} />
        )}
      </div>

      {/* Toggles */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
        <h2 className="font-semibold text-primary-dark mb-2">Settings</h2>
        {loading ? <Skeleton className="h-20" /> : (
          <>
            {([
              { key: 'enableRecording', label: 'Record calls', desc: 'Store audio recordings of all calls' },
              { key: 'enableTranscription', label: 'Transcribe calls', desc: 'Generate text transcripts' },
              { key: 'businessHoursOnly', label: 'Business hours only', desc: 'Agent only answers during operating hours' },
            ] as const).map(item => (
              <label key={item.key} className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-primary-dark">{item.label}</p>
                  <p className="text-xs text-primary-warm">{item.desc}</p>
                </div>
                <div
                  onClick={() => set(item.key, !config[item.key])}
                  className={`w-10 h-5.5 rounded-full transition-colors relative flex-shrink-0 ${
                    config[item.key] ? 'bg-primary' : 'bg-cream-dark'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    config[item.key] ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </div>
              </label>
            ))}
          </>
        )}
      </div>

      {error && <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-xl px-4 py-3">{error}</p>}

      <button onClick={handleSave} disabled={saving || loading}
        className={`px-6 py-3 rounded-full text-sm font-medium transition-colors disabled:opacity-40 ${
          saved ? 'bg-success text-white' : 'bg-primary text-cream-light hover:bg-primary-dark'
        }`}>
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
      </button>
    </div>
  );
}
