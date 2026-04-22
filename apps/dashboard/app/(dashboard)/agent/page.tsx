'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPut, apiDelete } from '../../../lib/api';

interface AgentConfig {
  name: string;
  language: string;
  tone: string;
  greeting?: string;
  fallbackMessage?: string;
  voiceId?: string;
  clonedVoiceId?: string;
  clonedVoiceName?: string;
  enableRecording: boolean;
  enableTranscription: boolean;
  businessHoursOnly: boolean;
  afterHoursMessage?: string;
  maxCallDuration: number;
}

const PRESET_VOICES = [
  { id: 'amaka', name: 'Amaka', desc: 'Warm, friendly — great for retail' },
  { id: 'chidi', name: 'Chidi', desc: 'Calm, professional — great for services' },
  { id: 'ngozi', name: 'Ngozi', desc: 'Energetic, upbeat — great for hospitality' },
];

const TONES = ['professional', 'friendly', 'concise', 'empathetic', 'formal'];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'ig', label: 'Igbo' },
  { code: 'ha', label: 'Hausa' },
  { code: 'pcm', label: 'Nigerian Pidgin' },
  { code: 'sw', label: 'Swahili' },
  { code: 'fr', label: 'French' },
];

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative flex-shrink-0 ${checked ? 'bg-primary' : 'bg-cream-dark'}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </div>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-primary-dark">{title}</h2>
        {desc && <p className="text-xs text-primary-warm mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export default function AgentPage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [config, setConfig] = useState<AgentConfig>({
    name: 'Milu',
    language: 'en',
    tone: 'friendly',
    greeting: "Hello, you've reached {businessName}. I'm your AI assistant. How can I help you today?",
    fallbackMessage: "I'm sorry, I didn't quite catch that. Could you please repeat your question?",
    voiceId: 'amaka',
    enableRecording: true,
    enableTranscription: true,
    businessHoursOnly: false,
    maxCallDuration: 600,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Voice clone state
  const [cloneFiles, setCloneFiles] = useState<File[]>([]);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState('');
  const [showCloneForm, setShowCloneForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setSaving(true); setError('');
    try {
      await apiPut(`/agent/${businessId}`, config, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  function set<K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) {
    setConfig(prev => ({ ...prev, [k]: v }));
  }

  async function handleCloneVoice() {
    if (!cloneFiles.length || !cloneName.trim()) return;
    setCloning(true); setCloneError('');
    try {
      const form = new FormData();
      form.append('name', cloneName);
      cloneFiles.forEach(f => form.append('files', f));
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/agent/${businessId}/voice-clone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Clone failed'); }
      const data = await res.json() as { voiceId: string; name: string };
      setConfig(prev => ({ ...prev, voiceId: data.voiceId, clonedVoiceId: data.voiceId, clonedVoiceName: data.name }));
      setShowCloneForm(false);
      setCloneFiles([]);
      setCloneName('');
    } catch (err: unknown) {
      setCloneError(err instanceof Error ? err.message : 'Voice clone failed');
    } finally { setCloning(false); }
  }

  async function handleRemoveClone() {
    try {
      await apiDelete(`/agent/${businessId}/voice-clone`, token);
      setConfig(prev => ({ ...prev, voiceId: 'amaka', clonedVoiceId: undefined, clonedVoiceName: undefined }));
    } catch { /* ignore */ }
  }

  const hasClone = !!config.clonedVoiceId;
  const durationOptions = [
    { value: 120, label: '2 minutes' },
    { value: 300, label: '5 minutes' },
    { value: 600, label: '10 minutes' },
    { value: 900, label: '15 minutes' },
    { value: 1800, label: '30 minutes' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Agent Setup</h1>
        <p className="text-sm text-primary-warm mt-0.5">Customise how your AI agent sounds and behaves on calls.</p>
      </div>

      {/* Identity */}
      <Section title="Agent identity" desc="How the agent identifies itself to callers.">
        {loading ? <Skeleton className="h-20" /> : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Agent name</label>
              <input type="text" className={inputCls} placeholder="e.g. Milu, Ada, Kemi" value={config.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Language</label>
              <select className={inputCls} value={config.language} onChange={e => set('language', e.target.value)}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </Section>

      {/* Voice */}
      <Section title="Voice" desc="Choose the voice your agent uses on calls.">
        {loading ? <Skeleton className="h-40" /> : (
          <div className="space-y-3">
            {/* Preset voices */}
            <div className="space-y-2">
              {PRESET_VOICES.map(v => (
                <label key={v.id} className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${config.voiceId === v.id && !hasClone ? 'border-primary/40 bg-primary/5' : 'border-cream-dark hover:border-cream-dark/60'}`}>
                  <input type="radio" name="voice" value={v.id} checked={config.voiceId === v.id && !hasClone}
                    onChange={() => { set('voiceId', v.id); }}
                    className="accent-primary w-4 h-4 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-primary-dark">{v.name}</p>
                    <p className="text-xs text-primary-warm">{v.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Cloned voice */}
            <div className={`p-4 rounded-xl border-2 transition-colors ${hasClone ? 'border-primary/40 bg-primary/5' : 'border-dashed border-cream-dark'}`}>
              {hasClone ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-primary-dark">{config.clonedVoiceName}</p>
                      <p className="text-xs text-primary-warm">Custom cloned voice · Active</p>
                    </div>
                  </div>
                  <button onClick={handleRemoveClone} className="text-xs text-danger hover:underline">Remove</button>
                </div>
              ) : (
                <div>
                  {!showCloneForm ? (
                    <button onClick={() => setShowCloneForm(true)} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Clone your own voice
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-primary-dark">Clone a voice</p>
                        <button onClick={() => { setShowCloneForm(false); setCloneFiles([]); setCloneName(''); }} className="text-primary-warm hover:text-primary-dark">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <input type="text" className={inputCls} placeholder="Voice name (e.g. Amara)" value={cloneName} onChange={e => setCloneName(e.target.value)} />
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-cream-dark rounded-xl p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
                      >
                        <p className="text-sm text-primary-warm">{cloneFiles.length ? `${cloneFiles.length} file(s) selected` : 'Upload audio samples (MP3/WAV, min 1 min total)'}</p>
                        <p className="text-xs text-primary-warm mt-1">Click to browse</p>
                        <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={e => setCloneFiles(Array.from(e.target.files ?? []))} />
                      </div>
                      <button
                        onClick={handleCloneVoice}
                        disabled={cloning || !cloneFiles.length || !cloneName.trim()}
                        className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {cloning && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                        {cloning ? 'Cloning voice…' : 'Create voice clone'}
                      </button>
                      {cloneError && <p className="text-xs text-danger">{cloneError}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Tone */}
      <Section title="Tone" desc="How your agent communicates with callers.">
        {loading ? <Skeleton className="h-10" /> : (
          <div className="flex flex-wrap gap-2">
            {TONES.map(t => (
              <button key={t} onClick={() => set('tone', t)}
                className={`px-4 py-2 rounded-full text-sm font-medium border capitalize transition-colors ${config.tone === t ? 'bg-primary text-cream-light border-primary' : 'bg-cream text-primary-warm border-cream-dark hover:border-primary/30'}`}>
                {t}
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* Scripts */}
      <Section title="Call scripts" desc="What the agent says during the call.">
        {loading ? <Skeleton className="h-40" /> : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">
                Greeting <span className="text-primary font-normal">{'{businessName}'} is replaced automatically</span>
              </label>
              <textarea rows={3} className={`${inputCls} resize-none leading-relaxed`}
                value={config.greeting ?? ''}
                onChange={e => set('greeting', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Fallback message</label>
              <p className="text-xs text-primary-warm mb-1.5">Said when the agent doesn&apos;t understand the caller.</p>
              <textarea rows={2} className={`${inputCls} resize-none leading-relaxed`}
                value={config.fallbackMessage ?? ''}
                onChange={e => set('fallbackMessage', e.target.value)} />
            </div>
          </div>
        )}
      </Section>

      {/* Call settings */}
      <Section title="Call settings">
        {loading ? <Skeleton className="h-48" /> : (
          <div className="space-y-5">
            {([
              { key: 'enableRecording' as const, label: 'Record calls', desc: 'Store audio recordings of all calls' },
              { key: 'enableTranscription' as const, label: 'Transcribe calls', desc: 'Generate text transcripts using AI (requires recording)' },
            ]).map(item => (
              <label key={item.key} className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-primary-dark">{item.label}</p>
                  <p className="text-xs text-primary-warm">{item.desc}</p>
                </div>
                <Toggle checked={config[item.key]} onChange={() => set(item.key, !config[item.key])} />
              </label>
            ))}
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Max call duration</label>
              <select className={inputCls} value={config.maxCallDuration} onChange={e => set('maxCallDuration', parseInt(e.target.value))}>
                {durationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </Section>

      {/* Business hours */}
      <Section title="Business hours" desc="Control when the agent answers calls.">
        {loading ? <Skeleton className="h-28" /> : (
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-primary-dark">Business hours only</p>
                <p className="text-xs text-primary-warm">Agent only answers during operating hours set in Knowledge Base</p>
              </div>
              <Toggle checked={config.businessHoursOnly} onChange={() => set('businessHoursOnly', !config.businessHoursOnly)} />
            </label>
            {config.businessHoursOnly && (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-primary-dark mb-1.5">After-hours message</label>
                  <textarea rows={2} className={`${inputCls} resize-none`}
                    placeholder="We are currently closed. Please call back during business hours."
                    value={config.afterHoursMessage ?? ''}
                    onChange={e => set('afterHoursMessage', e.target.value)} />
                </div>
                <a href="/knowledge-base" className="text-xs text-primary hover:underline">
                  Set operating hours in Knowledge Base →
                </a>
              </div>
            )}
          </div>
        )}
      </Section>

      {error && <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-xl px-4 py-3">{error}</p>}

      <button onClick={handleSave} disabled={saving || loading}
        className={`px-8 py-3 rounded-full text-sm font-medium transition-colors disabled:opacity-40 ${saved ? 'bg-success text-white' : 'bg-primary text-cream-light hover:bg-primary-dark'}`}>
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
      </button>
    </div>
  );
}
