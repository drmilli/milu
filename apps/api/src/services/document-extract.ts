import { logger } from '../config/logger';
import { env } from '../config/env';

export type DocType = 'pdf' | 'docx' | 'txt' | 'image';

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
      return await describeImageWithClaude(buffer, mimetype);
    }

    return '';
  } catch (err) {
    logger.error({ err, fileType }, 'Document text extraction failed');
    return '';
  }
}

async function describeImageWithClaude(buffer: Buffer, mimetype: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return '[Image uploaded — AI description unavailable]';

  try {
    const base64 = buffer.toString('base64');
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
            {
              type: 'image',
              source: { type: 'base64', media_type: mimetype, data: base64 },
            },
            {
              type: 'text',
              text: 'Describe this business image in detail. Extract any text, product names, prices, services, or business information visible. Be thorough — this will be used to train an AI customer service agent.',
            },
          ],
        }],
      }),
    });

    if (!res.ok) throw new Error(`Claude API error ${res.status}`);
    const data = await res.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  } catch (err) {
    logger.error({ err }, 'Claude image description failed');
    return '[Image uploaded — description unavailable]';
  }
}

export async function summariseContent(content: string, filename: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY || !content.trim()) return '';
  try {
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
          content: `You are analyzing a business document called "${filename}" that will be used to train an AI customer service agent.\n\nDocument content:\n${content.slice(0, 8000)}\n\nProvide a clear breakdown with:\n1. **What this document is** (1 sentence)\n2. **Key information** (bullet points — products, services, prices, policies, contacts, hours, etc.)\n3. **How the AI agent can use this** (1-2 sentences)\n\nBe concise and practical.`,
        }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude ${res.status}: ${body}`);
    }
    const data = await res.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text ?? '';
  } catch (err) {
    logger.error({ err, filename }, 'Document summarisation failed');
    return '';
  }
}

export async function scrapeWebsite(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Milu-AI-Bot/1.0 (business knowledge crawler)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Dynamic import for node-html-parser
    const { parse } = await import('node-html-parser');
    const root = parse(html);

    // Remove scripts, styles, nav, footer
    root.querySelectorAll('script,style,nav,footer,header,noscript,svg,iframe').forEach((el: { remove: () => void }) => el.remove());

    // Extract meaningful text
    const text = root.querySelector('main,article,#content,.content,body')?.text ?? root.text;

    // Clean up whitespace
    return text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 50000);
  } catch (err) {
    logger.error({ err, url }, 'Website scrape failed');
    throw new Error(`Could not scrape website: ${(err as Error).message}`);
  }
}
