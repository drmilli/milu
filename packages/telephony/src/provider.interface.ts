import { EventEmitter } from 'eventemitter3';

export interface InboundCall {
  callId: string;
  callerNumber: string;
  dialedNumber: string;
  direction: 'inbound';
}

export interface TelephonyProviderEvents {
  inbound: (call: InboundCall) => void;
  error: (err: Error) => void;
}

export abstract class TelephonyProvider extends EventEmitter<TelephonyProviderEvents> {
  abstract handleInboundWebhook(body: Record<string, string>): InboundCall;
  abstract buildVoiceResponse(text: string): string;
  abstract transferCall(callId: string, toNumber: string): Promise<void>;
  abstract endCall(callId: string): Promise<void>;
}
