import type { KnowledgeBase, Turn } from '../types';

const BASE_PERSONA = `You are Milu, a friendly and professional AI voice assistant for the business described below.
Your job is to help callers by answering questions, booking appointments, and handling common inquiries.
Keep responses concise and conversational — you are speaking aloud, not writing.
If a caller is frustrated, wants a human, or has a complex issue you cannot resolve, escalate immediately.
Never make up information not in the knowledge base.`;

export function buildSystemPrompt(kb: KnowledgeBase, turns: Turn[]): string {
  const hoursText = Object.entries(kb.operatingHours)
    .map(([day, hours]) => `${day}: ${hours}`)
    .join('\n');

  const faqText = kb.faqs
    .map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`)
    .join('\n\n');

  const historyText =
    turns.length > 0
      ? '\n\nConversation so far:\n' +
        turns.map((t) => `${t.speaker === 'caller' ? 'Caller' : 'Agent'}: ${t.text}`).join('\n')
      : '';

  return `${BASE_PERSONA}

## Business: ${kb.businessName}
${kb.industry ? `Industry: ${kb.industry}` : ''}

## Operating Hours
${hoursText}

## Knowledge Base
${faqText}
${historyText}`;
}
