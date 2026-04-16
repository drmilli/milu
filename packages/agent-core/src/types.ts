export type Intent =
  | 'faq'
  | 'booking'
  | 'order_status'
  | 'complaint'
  | 'escalate'
  | 'unknown';

export interface FAQ {
  question: string;
  answer: string;
}

export interface OperatingHours {
  weekdays?: string;
  saturday?: string;
  sunday?: string;
  [key: string]: string | undefined;
}

export interface KnowledgeBase {
  businessName: string;
  industry?: string;
  operatingHours: OperatingHours;
  faqs: FAQ[];
  escalationNumber?: string;
  voiceId?: string;
}

export interface Turn {
  speaker: 'caller' | 'agent';
  text: string;
  intent?: Intent;
  timestamp: Date;
}

export interface CallContext {
  callId: string;
  businessId: string;
  callerNumber: string;
  turns: Turn[];
  startedAt: Date;
}

export interface AgentConfig {
  businessId: string;
  knowledgeBase: KnowledgeBase;
  onEscalate?: (callId: string, summary: string) => Promise<void> | void;
}

export interface AgentEvents {
  transcript: (text: string, intent: Intent) => void;
  response: (audio: Buffer) => void;
  escalate: (callId: string, summary: string) => void;
  error: (err: Error) => void;
  end: () => void;
}
