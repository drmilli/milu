'use client';

import { useState } from 'react';

type Entry = { id: number; question: string; answer: string };

const initial: Entry[] = [
  { id: 1, question: 'What are your opening hours?', answer: 'We are open Monday to Friday 9 AM to 6 PM, Saturday 10 AM to 4 PM, and Sunday 12 PM to 5 PM.' },
  { id: 2, question: 'Do you offer delivery?', answer: 'Yes, we deliver within Lagos for ₦1,500. Orders above ₦50,000 get free delivery.' },
  { id: 3, question: 'What is your return policy?', answer: 'We accept returns within 7 days of purchase. Items must be unworn and in original packaging.' },
  { id: 4, question: 'How can I track my order?', answer: 'Once your order ships, we will send a tracking link to your WhatsApp number.' },
];

export default function KnowledgeBasePage() {
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ question: '', answer: '' });
  const [draft, setDraft] = useState<Record<number, Entry>>({});

  function startEdit(e: Entry) {
    setEditing(e.id);
    setDraft((d) => ({ ...d, [e.id]: { ...e } }));
  }

  function saveEdit(id: number) {
    setEntries((prev) => prev.map((e) => (e.id === id ? draft[id] : e)));
    setEditing(null);
  }

  function deleteEntry(id: number) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function addEntry() {
    if (!form.question.trim() || !form.answer.trim()) return;
    setEntries((prev) => [...prev, { id: Date.now(), ...form }]);
    setForm({ question: '', answer: '' });
    setAdding(false);
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Knowledge Base</h1>
          <p className="text-sm text-primary-warm mt-0.5">FAQs your agent uses to answer callers.</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add entry
        </button>
      </div>

      <div className="space-y-3">
        {/* Add form */}
        {adding && (
          <div className="bg-white rounded-2xl border-2 border-primary/30 p-5 space-y-3">
            <input
              className="w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
              placeholder="Question"
              value={form.question}
              onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            />
            <textarea
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 resize-none"
              placeholder="Answer"
              value={form.answer}
              onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdding(false)} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
              <button onClick={addEntry} className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">Save</button>
            </div>
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="bg-white rounded-2xl border border-cream-dark p-5">
            {editing === entry.id ? (
              <div className="space-y-3">
                <input
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark focus:outline-none focus:border-primary/50"
                  value={draft[entry.id]?.question ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [entry.id]: { ...d[entry.id], question: e.target.value } }))}
                />
                <textarea
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark focus:outline-none focus:border-primary/50 resize-none"
                  value={draft[entry.id]?.answer ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [entry.id]: { ...d[entry.id], answer: e.target.value } }))}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditing(null)} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
                  <button onClick={() => saveEdit(entry.id)} className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">Save</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-primary-dark text-sm">{entry.question}</p>
                  <p className="text-sm text-primary-warm mt-1 leading-relaxed">{entry.answer}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(entry)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream hover:text-primary-dark transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-danger/8 hover:text-danger transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
