import Anthropic from '@anthropic-ai/sdk';
import type { KnowledgeBase, Turn } from '../types';
import { buildSystemPrompt } from './prompt-builder';

const MODEL = 'claude-sonnet-4-6';

export class ClaudeLLM {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async respond(
    userText: string,
    kb: KnowledgeBase,
    turns: Turn[],
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt(kb, turns);

    const message = await this.client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
    return block.text;
  }
}
