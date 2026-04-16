'use client';

import { useState } from 'react';
import { clsx } from 'clsx';

type Call = {
  id: string;
  caller: string;
  duration: string;
  intent: string;
  status: 'resolved' | 'escalated' | 'missed';
  date: string;
  transcript: { role: 'agent' | 'caller'; text: string }[];
};

const calls: Call[] = [
  {
    id: 'C-1041',
    caller: '+234 801 234 5678',
    duration: '2m 14s',
    intent: 'Pricing enquiry',
    status: 'resolved',
    date: 'Today, 10:42 AM',
    transcript: [
      { role: 'agent', text: "Hello, you've reached Amaka's Boutique. I'm Milu, your AI assistant. How can I help you today?" },
      { role: 'caller', text: 'Hi, I wanted to ask about the price of the Ankara set I saw on Instagram.' },
      { role: 'agent', text: "Of course! Our Ankara co-ord sets start at ₦18,000 for the standard size and go up to ₦24,000 for plus sizes. Would you like to know about any specific design?" },
      { role: 'caller', text: 'The blue and white one with the ruffles.' },
      { role: 'agent', text: 'That would be the Classic Ruffle Ankara Set — it is priced at ₦21,000 in standard sizes. We have stock available in sizes S to XL. Would you like to place an order or have it reserved?' },
      { role: 'caller', text: 'I will think about it. Thank you.' },
      { role: 'agent', text: 'No problem at all. Feel free to call back anytime. Have a wonderful day!' },
    ],
  },
  {
    id: 'C-1040',
    caller: '+234 802 987 6543',
    duration: '0m 58s',
    intent: 'Opening hours',
    status: 'resolved',
    date: 'Today, 10:29 AM',
    transcript: [
      { role: 'agent', text: "Hello, you've reached Amaka's Boutique. How can I help you?" },
      { role: 'caller', text: 'What time do you open on Sundays?' },
      { role: 'agent', text: 'We are open on Sundays from 12 noon to 6 PM. Is there anything else I can help you with?' },
      { role: 'caller', text: 'That is all, thank you.' },
      { role: 'agent', text: 'You are welcome! Have a great day.' },
    ],
  },
  {
    id: 'C-1039',
    caller: '+234 803 111 2222',
    duration: '4m 02s',
    intent: 'Complaint — wrong item delivered',
    status: 'escalated',
    date: 'Today, 10:11 AM',
    transcript: [
      { role: 'agent', text: "Hello, you've reached Amaka's Boutique. I'm Milu, your AI assistant. How can I help you?" },
      { role: 'caller', text: "I got the wrong item delivered yesterday and I'm very upset about it." },
      { role: 'agent', text: "I'm really sorry to hear that. I completely understand how frustrating that must be. Can I get your order number so I can look into this for you?" },
      { role: 'caller', text: 'It is order number AB-20234.' },
      { role: 'agent', text: "Thank you. I can see your order for the Red Lace Blouse. I'm going to transfer you to our customer care team right now who will sort out a replacement or refund immediately. Please hold on." },
      { role: 'caller', text: 'Okay, thank you.' },
    ],
  },
  {
    id: 'C-1038',
    caller: '+234 805 444 5555',
    duration: '1m 30s',
    intent: 'Appointment booking',
    status: 'resolved',
    date: 'Today, 09:54 AM',
    transcript: [
      { role: 'agent', text: "Hello, you've reached Amaka's Boutique. How can I help you today?" },
      { role: 'caller', text: 'I would like to book an appointment for a fitting.' },
      { role: 'agent', text: 'Wonderful! We have slots available this Friday the 18th at 2 PM, 3 PM, and 4 PM. Which works best for you?' },
      { role: 'caller', text: 'Friday at 3 PM please.' },
      { role: 'agent', text: "Perfect! I have booked you in for Friday April 18th at 3 PM. May I take your name please?" },
      { role: 'caller', text: 'Chidinma Eze.' },
      { role: 'agent', text: "Thank you, Chidinma! Your appointment is confirmed for Friday at 3 PM. We'll see you then. Goodbye!" },
    ],
  },
  {
    id: 'C-1037',
    caller: '+234 701 888 9999',
    duration: '3m 17s',
    intent: 'Product return',
    status: 'escalated',
    date: 'Today, 08:33 AM',
    transcript: [
      { role: 'agent', text: "Hello, you've reached Amaka's Boutique. How can I help you?" },
      { role: 'caller', text: 'I want to return a dress I bought last week.' },
      { role: 'agent', text: "I understand. Our return policy allows returns within 7 days of purchase for items in their original condition. Could you share your order number so I can check the details?" },
      { role: 'caller', text: 'I do not have the order number but I paid by transfer.' },
      { role: 'agent', text: "No problem. I'll transfer you to our team who can pull up your purchase from the transfer records. Please hold." },
    ],
  },
];

const statusCls: Record<string, string> = {
  resolved: 'bg-success/10 text-success',
  escalated: 'bg-warning/10 text-warning',
  missed: 'bg-danger/10 text-danger',
};

export default function CallsPage() {
  const [selected, setSelected] = useState<Call>(calls[0]);
  const [filter, setFilter] = useState<'all' | 'resolved' | 'escalated' | 'missed'>('all');
  const [search, setSearch] = useState('');

  const filtered = calls.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.caller.includes(search) && !c.intent.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex h-full">
      {/* Call list */}
      <div className="w-80 flex-shrink-0 border-r border-cream-dark flex flex-col bg-white">
        {/* Search + filter */}
        <div className="p-4 border-b border-cream-dark space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              className="w-full pl-9 pr-4 py-2 text-sm bg-cream-light border border-cream-dark rounded-xl placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
              placeholder="Search calls…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'resolved', 'escalated', 'missed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  'text-xs px-3 py-1.5 rounded-full font-medium transition-colors capitalize',
                  filter === f
                    ? 'bg-primary text-cream-light'
                    : 'bg-cream text-primary-warm hover:bg-cream-dark'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-cream-dark">
          {filtered.map((call) => (
            <button
              key={call.id}
              onClick={() => setSelected(call)}
              className={clsx(
                'w-full text-left px-4 py-3.5 transition-colors hover:bg-cream-light/60',
                selected.id === call.id ? 'bg-cream-light' : ''
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-primary-dark">{call.caller}</span>
                <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', statusCls[call.status])}>
                  {call.status}
                </span>
              </div>
              <p className="text-xs text-primary-warm truncate">{call.intent}</p>
              <p className="text-xs text-cream-dark mt-1">{call.date} · {call.duration}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-primary-warm text-center py-12">No calls found</p>
          )}
        </div>
      </div>

      {/* Transcript panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-cream-light/50">
        {/* Header */}
        <div className="bg-white border-b border-cream-dark px-6 py-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-primary-dark">{selected.caller}</p>
            <p className="text-xs text-primary-warm mt-0.5">{selected.date} · {selected.duration} · {selected.intent}</p>
          </div>
          <span className={clsx('text-xs font-medium px-3 py-1.5 rounded-full', statusCls[selected.status])}>
            {selected.status}
          </span>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {selected.transcript.map((turn, i) => (
            <div key={i} className={clsx('flex gap-3', turn.role === 'agent' ? 'flex-row' : 'flex-row-reverse')}>
              <div className={clsx(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold',
                turn.role === 'agent' ? 'bg-primary text-cream-light' : 'bg-cream-dark text-primary-warm'
              )}>
                {turn.role === 'agent' ? 'AI' : 'C'}
              </div>
              <div className={clsx(
                'max-w-md px-4 py-3 rounded-2xl text-sm leading-relaxed',
                turn.role === 'agent'
                  ? 'bg-white border border-cream-dark text-primary-dark rounded-tl-sm'
                  : 'bg-primary text-cream-light rounded-tr-sm'
              )}>
                {turn.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
