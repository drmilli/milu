'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const transcript = [
  { role: 'agent' as const, text: "Hello, you've reached Amaka's Boutique. How can I help you today?" },
  { role: 'caller' as const, text: 'Hi, I wanted to ask about the price of your Ankara sets.' },
  { role: 'agent' as const, text: 'Of course! Our Ankara co-ord sets start at ₦18,000. We have several styles currently in stock. Were you looking for something specific?' },
  { role: 'caller' as const, text: 'Yes, the ruffled one I saw on your Instagram page.' },
];

export default function ActiveCallPage() {
  const [elapsed, setElapsed] = useState(74);
  const [liveTranscript, setLiveTranscript] = useState(transcript);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Simulate agent typing a new response after 4 seconds
  useEffect(() => {
    const t = setTimeout(() => {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        setLiveTranscript((prev) => [
          ...prev,
          { role: 'agent', text: "That would be the Classic Ruffle Ankara Set — priced at ₦21,000 in standard sizes. We have stock in S to XL. Would you like to reserve one?" },
        ]);
      }, 2200);
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-cream-dark px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-primary-dark">+234 803 555 7890</p>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-xs text-primary-warm">Pricing enquiry · AI handling</p>
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-1.5 text-primary-dark">
          <svg className="w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-mono text-sm font-semibold tabular-nums">{mins}:{secs}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          <button className="flex items-center gap-2 text-sm text-warning border border-warning/30 px-3 py-2 rounded-xl hover:bg-warning/6 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
            </svg>
            Take over
          </button>
          <button className="flex items-center gap-2 text-sm text-danger border border-danger/30 px-3 py-2 rounded-xl hover:bg-danger/6 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            End call
          </button>
        </div>
      </div>

      {/* Main: transcript + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Live transcript */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-cream-light/40">
          <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-2">Live transcript</p>
          {liveTranscript.map((turn, i) => (
            <div key={i} className={`flex gap-3 ${turn.role === 'agent' ? 'flex-row' : 'flex-row-reverse'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                turn.role === 'agent' ? 'bg-primary text-cream-light' : 'bg-cream-dark text-primary-warm'
              }`}>
                {turn.role === 'agent' ? 'AI' : 'C'}
              </div>
              <div className={`max-w-md px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                turn.role === 'agent'
                  ? 'bg-white border border-cream-dark text-primary-dark rounded-tl-sm'
                  : 'bg-primary text-cream-light rounded-tr-sm'
              }`}>
                {turn.text}
              </div>
            </div>
          ))}

          {/* Agent typing indicator */}
          {typing && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-xs font-semibold text-cream-light">
                AI
              </div>
              <div className="bg-white border border-cream-dark px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary-warm animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-primary-warm animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-primary-warm animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-72 flex-shrink-0 border-l border-cream-dark bg-white flex flex-col">
          {/* Caller info */}
          <div className="p-5 border-b border-cream-dark">
            <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-3">Caller</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-primary-warm">Number</span>
                <span className="font-medium text-primary-dark">+234 803 555 7890</span>
              </div>
              <div className="flex justify-between">
                <span className="text-primary-warm">First contact</span>
                <span className="font-medium text-primary-dark">New caller</span>
              </div>
              <div className="flex justify-between">
                <span className="text-primary-warm">Intent</span>
                <span className="font-medium text-primary-dark">Pricing</span>
              </div>
            </div>
          </div>

          {/* Agent status */}
          <div className="p-5 border-b border-cream-dark">
            <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-3">Agent status</p>
            <div className="space-y-2.5">
              {[
                { label: 'STT', status: 'ok', detail: 'Deepgram' },
                { label: 'LLM', status: 'ok', detail: 'Claude 3.5' },
                { label: 'TTS', status: 'ok', detail: 'ElevenLabs' },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between text-sm">
                  <span className="text-primary-warm">{s.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    <span className="text-xs text-primary-warm">{s.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="p-5">
            <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-3">Quick actions</p>
            <div className="space-y-2">
              <button className="w-full text-left text-sm text-primary-dark px-3 py-2.5 rounded-xl border border-cream-dark hover:bg-cream-light transition-colors flex items-center gap-2.5">
                <svg className="w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
                </svg>
                Transfer to me
              </button>
              <button className="w-full text-left text-sm text-primary-dark px-3 py-2.5 rounded-xl border border-cream-dark hover:bg-cream-light transition-colors flex items-center gap-2.5">
                <svg className="w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                Add note
              </button>
              <Link
                href="/knowledge-base"
                className="w-full text-left text-sm text-primary-dark px-3 py-2.5 rounded-xl border border-cream-dark hover:bg-cream-light transition-colors flex items-center gap-2.5"
              >
                <svg className="w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                View knowledge base
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
