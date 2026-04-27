import { logger } from '../config/logger';
import { env } from '../config/env';

export type DocType = 'pdf' | 'docx' | 'txt' | 'image';

const DOC_PROMPT = (filename: string, content: string) =>
  `You are analyzing a business document called "${filename}" that will be used to train an AI customer service agent.\n\nDocument content:\n${content.slice(0, 8000)}\n\nProvide a clear breakdown with:\n1. **What this document is** (1 sentence)\n2. **Key information** (bullet points — products, services, prices, policies, contacts, hours, etc.)\n3. **How the AI agent can use this** (1-2 sentences)\n\nBe concise and practical.`;

const IMAGE_PROMPT = 'Describe this business image in detail. Extract any text, product names, prices, services, or business information visible. Be thorough — this will be used to train an AI customer service agent.';

export function detectFileType(mimetype: string, filename: string): DocType {
  if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) return 'pdf';
  if (mimetype.includes('wordprocessingml') || filename.endsWith('.docx') || filename.endsWith('.doc')) return 'docx';
  if (mimetype.startsWith('image/')) return 'image';
  return 'txt';
}

export async function extractText(buffer: Buffer, fileType: DocType, mimetype: string): Promise<string> {
  try {
    if (fileType === 'pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return (data.text as string).trim();
    }

    if (fileType === 'docx') {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return value.trim();
    }

    if (fileType === 'txt') {
      return buffer.toString('utf-8').trim();
    }

    if (fileType === 'image') {
      return await describeImage(buffer, mimetype);
    }

    return '';
  } catch (err) {
    logger.error({ err, fileType }, 'Document text extraction failed');
    return '';
  }
}

// ─── Claude helpers ────────────────────────────────────────────────────────

async function claudeText(prompt: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('No ANTHROPIC_API_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) { const b = await res.text(); throw new Error(`Claude ${res.status}: ${b}`); }
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text ?? '';
}

async function claudeVision(base64: string, mimetype: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('No ANTHROPIC_API_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimetype, data: base64 } },
          { type: 'text', text: IMAGE_PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) { const b = await res.text(); throw new Error(`Claude ${res.status}: ${b}`); }
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text ?? '';
}

// ─── OpenAI helpers ────────────────────────────────────────────────────────

async function openaiText(prompt: string): Promise<string> {
  if (!env.OPENAI_API_KEY) throw new Error('No OPENAI_API_KEY');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) { const b = await res.text(); throw new Error(`OpenAI ${res.status}: ${b}`); }
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function openaiVision(base64: string, mimetype: string): Promise<string> {
  if (!env.OPENAI_API_KEY) throw new Error('No OPENAI_API_KEY');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimetype};base64,${base64}` } },
          { type: 'text', text: IMAGE_PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) { const b = await res.text(); throw new Error(`OpenAI ${res.status}: ${b}`); }
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

// ─── Public functions with Claude → OpenAI fallback ───────────────────────

async function describeImage(buffer: Buffer, mimetype: string): Promise<string> {
  const base64 = buffer.toString('base64');
  if (env.ANTHROPIC_API_KEY) {
    try { return await claudeVision(base64, mimetype); } catch (err) {
      logger.warn({ err }, 'Claude vision failed, trying OpenAI');
    }
  }
  if (env.OPENAI_API_KEY) {
    try { return await openaiVision(base64, mimetype); } catch (err) {
      logger.error({ err }, 'OpenAI vision failed');
    }
  }
  return '[Image uploaded — AI description unavailable]';
}

export async function summariseContent(content: string, filename: string): Promise<string> {
  if (!content.trim()) return '';
  const prompt = DOC_PROMPT(filename, content);

  if (env.ANTHROPIC_API_KEY) {
    try { return await claudeText(prompt); } catch (err) {
      logger.warn({ err, filename }, 'Claude summarisation failed, trying OpenAI');
    }
  }
  if (env.OPENAI_API_KEY) {
    try { return await openaiText(prompt); } catch (err) {
      logger.error({ err, filename }, 'OpenAI summarisation failed');
    }
  }
  return '';
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function kbChat(
  messages: ChatMessage[],
  context: { businessName: string; faqs: { question: string; answer: string }[]; websiteSummary?: string | null; docSummaries: string[] },
): Promise<string> {
  const systemPrompt = `You are an AI assistant helping "${context.businessName}" build their AI customer service knowledge base.

Current knowledge base context:
${context.websiteSummary ? `Website summary:\n${context.websiteSummary}\n` : ''}
${context.docSummaries.length ? `Uploaded documents:\n${context.docSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n` : ''}
${context.faqs.length ? `Current FAQs (${context.faqs.length}):\n${context.faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}` : 'No FAQs yet.'}

Your role:
- Help the user add useful information to their knowledge base
- Suggest FAQ entries when appropriate — format them clearly as "Q: ... / A: ..."
- Ask clarifying questions to extract business details (hours, prices, services, policies, contacts)
- Be concise and practical — this knowledge will train an AI phone agent
- When suggesting multiple FAQs, list each on its own line starting with "Q:"`;

  const payload = {
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  };

  if (env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const b = await res.text(); throw new Error(`Claude ${res.status}: ${b}`); }
      const data = await res.json() as { content: Array<{ text: string }> };
      return data.content[0]?.text ?? '';
    } catch (err) { logger.warn({ err }, 'Claude kbChat failed, trying OpenAI'); }
  }

  if (env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 1024,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      });
      if (!res.ok) { const b = await res.text(); throw new Error(`OpenAI ${res.status}: ${b}`); }
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content ?? '';
    } catch (err) { logger.error({ err }, 'OpenAI kbChat failed'); }
  }

  return 'AI is not configured. Please add ANTHROPIC_API_KEY or OPENAI_API_KEY to your environment.';
}

// ─── Voice conversation (phone agent) ────────────────────────────────────────

export interface VoiceChatResult {
  reply: string;
  action: 'continue' | 'escalate' | 'end';
}

export async function voiceChat(
  messages: ChatMessage[],
  context: {
    businessName: string;
    faqs: { question: string; answer: string }[];
    websiteSummary?: string | null;
    docSummaries: string[];
    agentTone?: string | null;
    escalationNumber?: string | null;
  },
): Promise<VoiceChatResult> {
  const systemPrompt = `You are a phone agent for "${context.businessName}". Be brief and natural — max 2 sentences per reply. No lists or markdown.${context.agentTone ? ` Tone: ${context.agentTone}.` : ''}
${context.websiteSummary ? `Business: ${context.websiteSummary.slice(0, 400)}\n` : ''}${context.faqs.length ? `FAQs:\n${context.faqs.slice(0, 6).map(f => `Q: ${f.question} A: ${f.answer}`).join('\n')}\n` : ''}${context.docSummaries.length ? `Info: ${context.docSummaries.slice(0, 2).map(s => s.slice(0, 200)).join(' ')}\n` : ''}If you can't answer, say you'll transfer them to the team.${context.escalationNumber ? ' Escalation available.' : ''}
End your reply with one of: [CONTINUE] [ESCALATE] [END]`;

  const msgs = messages.map(m => ({ role: m.role, content: m.content }));
  let raw = '';

  // Claude Haiku first — fastest for short voice replies
  if (env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, system: systemPrompt, messages: msgs }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { const b = await res.text(); throw new Error(`Claude ${res.status}: ${b}`); }
      const data = await res.json() as { content: Array<{ text: string }> };
      raw = data.content[0]?.text ?? '';
    } catch (err) { logger.warn({ err }, 'Claude voiceChat failed, trying OpenAI'); }
  }

  if (!raw && env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: 200,
          messages: [{ role: 'system', content: systemPrompt }, ...msgs],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { const b = await res.text(); throw new Error(`OpenAI ${res.status}: ${b}`); }
      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      raw = data.choices[0]?.message?.content ?? '';
    } catch (err) { logger.error({ err }, 'OpenAI voiceChat failed'); }
  }

  if (!raw) {
    return { reply: "I'm sorry, I'm having trouble right now. Please call back shortly.", action: 'end' };
  }

  const actionMatch = raw.match(/\[(CONTINUE|ESCALATE|END)\]\s*$/i);
  const action = (actionMatch?.[1]?.toLowerCase() ?? 'continue') as 'continue' | 'escalate' | 'end';
  const reply = raw.replace(/\s*\[(CONTINUE|ESCALATE|END)\]\s*$/i, '').trim();
  return { reply, action };
}

export async function scrapeWebsite(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Milu-AI-Bot/1.0 (business knowledge crawler)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const { parse } = await import('node-html-parser');
    const root = parse(html);

    root.querySelectorAll('script,style,nav,footer,header,noscript,svg,iframe').forEach((el: { remove: () => void }) => el.remove());

    const text = root.querySelector('main,article,#content,.content,body')?.text ?? root.text;

    return text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 50000);
  } catch (err) {
    logger.error({ err, url }, 'Website scrape failed');
    throw new Error(`Could not scrape website: ${(err as Error).message}`);
  }
}
