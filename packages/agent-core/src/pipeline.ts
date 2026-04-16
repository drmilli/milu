import { EventEmitter } from 'eventemitter3';
import type { AgentConfig, AgentEvents, CallContext, Turn } from './types';
import { DeepgramSTT } from './stt/deepgram';
import { ClaudeLLM } from './llm/claude';
import { ElevenLabsTTS } from './tts/elevenlabs';
import { classifyIntent } from './intent';

export class AgentPipeline extends EventEmitter<AgentEvents> {
  private stt: DeepgramSTT;
  private llm: ClaudeLLM;
  private tts: ElevenLabsTTS;
  private config: AgentConfig;
  private context: CallContext;

  constructor(
    config: AgentConfig,
    context: CallContext,
    deps: {
      deepgramApiKey: string;
      anthropicApiKey: string;
      elevenLabsApiKey: string;
    },
  ) {
    super();
    this.config = config;
    this.context = context;

    this.stt = new DeepgramSTT(deps.deepgramApiKey);
    this.llm = new ClaudeLLM(deps.anthropicApiKey);
    this.tts = new ElevenLabsTTS({
      apiKey: deps.elevenLabsApiKey,
      voiceId: config.knowledgeBase.voiceId ?? 'default',
    });

    this.stt.on('transcript', this.handleTranscript.bind(this));
    this.stt.on('error', (err) => this.emit('error', err));
  }

  start() {
    this.stt.connect();
  }

  receiveAudio(chunk: Buffer) {
    this.stt.send(chunk);
  }

  private async handleTranscript(text: string, isFinal: boolean) {
    if (!isFinal) return;

    const intent = classifyIntent(text);
    this.emit('transcript', text, intent);

    const callerTurn: Turn = {
      speaker: 'caller',
      text,
      intent,
      timestamp: new Date(),
    };
    this.context.turns.push(callerTurn);

    if (intent === 'escalate') {
      const summary = this.buildEscalationSummary();
      this.emit('escalate', this.context.callId, summary);
      await this.config.onEscalate?.(this.context.callId, summary);
      return;
    }

    try {
      const responseText = await this.llm.respond(
        text,
        this.config.knowledgeBase,
        this.context.turns,
      );

      const agentTurn: Turn = {
        speaker: 'agent',
        text: responseText,
        timestamp: new Date(),
      };
      this.context.turns.push(agentTurn);

      const audio = await this.tts.synthesize(responseText);
      this.emit('response', audio);
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  private buildEscalationSummary(): string {
    const lines = this.context.turns
      .slice(-6)
      .map((t) => `${t.speaker === 'caller' ? 'Caller' : 'Agent'}: ${t.text}`)
      .join('\n');
    return `Call escalated after ${this.context.turns.length} turns.\n\nRecent conversation:\n${lines}`;
  }

  end() {
    this.stt.close();
    this.emit('end');
  }
}
