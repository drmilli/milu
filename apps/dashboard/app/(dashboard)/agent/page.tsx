'use client';

import { useState } from 'react';

const voices = [
  { id: 'amaka', name: 'Amaka', desc: 'Warm, friendly — great for retail', preview: '#' },
  { id: 'chidi', name: 'Chidi', desc: 'Calm, professional — great for services', preview: '#' },
  { id: 'ngozi', name: 'Ngozi', desc: 'Energetic, upbeat — great for hospitality', preview: '#' },
];

const tones = ['Professional', 'Friendly', 'Concise', 'Empathetic', 'Formal'];

export default function AgentPage() {
  const [voice, setVoice] = useState('amaka');
  const [selectedTones, setSelectedTones] = useState<string[]>(['Professional', 'Friendly']);
  const [greeting, setGreeting] = useState("Hello, you've reached {businessName}. I'm Milu, your AI assistant. How can I help you today?");
  const [saved, setSaved] = useState(false);

  function toggleTone(t: string) {
    setSelectedTones((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        <div className="space-y-2.5">
          {voices.map((v) => (
            <label
              key={v.id}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                voice === v.id
                  ? 'border-primary/40 bg-primary/4'
                  : 'border-cream-dark hover:border-cream-dark/80'
              }`}
            >
              <input
                type="radio"
                name="voice"
                value={v.id}
                checked={voice === v.id}
                onChange={() => setVoice(v.id)}
                className="accent-primary w-4 h-4 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-dark">{v.name}</p>
                <p className="text-xs text-primary-warm">{v.desc}</p>
              </div>
              <button className="w-8 h-8 rounded-lg border border-cream-dark flex items-center justify-center text-primary-warm hover:bg-cream transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              </button>
            </label>
          ))}
        </div>
      </div>

      {/* Tone */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <h2 className="font-semibold text-primary-dark mb-1">Tone</h2>
        <p className="text-xs text-primary-warm mb-4">Select how your agent communicates. Pick up to 3.</p>
        <div className="flex flex-wrap gap-2">
          {tones.map((t) => (
            <button
              key={t}
              onClick={() => toggleTone(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                selectedTones.includes(t)
                  ? 'bg-primary text-cream-light border-primary'
                  : 'bg-cream text-primary-warm border-cream-dark hover:border-primary/30'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Greeting */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <h2 className="font-semibold text-primary-dark mb-1">Greeting script</h2>
        <p className="text-xs text-primary-warm mb-4">
          What the agent says at the start of every call.{' '}
          <span className="text-primary">{'{businessName}'}</span> is replaced automatically.
        </p>
        <textarea
          rows={4}
          className="w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        className={`px-6 py-3 rounded-full text-sm font-medium transition-colors ${
          saved
            ? 'bg-success text-white'
            : 'bg-primary text-cream-light hover:bg-primary-dark'
        }`}
      >
        {saved ? '✓ Saved' : 'Save changes'}
      </button>
    </div>
  );
}
