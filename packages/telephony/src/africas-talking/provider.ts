import { TelephonyProvider, type InboundCall } from '../provider.interface';
import { buildSayResponse, buildTransferResponse } from './xml-builder';

interface AfricasTalkingConfig {
  apiKey: string;
  username: string;
}

export class AfricasTalkingProvider extends TelephonyProvider {
  private apiKey: string;
  private username: string;

  constructor({ apiKey, username }: AfricasTalkingConfig) {
    super();
    this.apiKey = apiKey;
    this.username = username;
  }

  handleInboundWebhook(body: Record<string, string>): InboundCall {
    const call: InboundCall = {
      callId: body['callSessionState'] ?? body['sessionId'] ?? '',
      callerNumber: body['callerNumber'] ?? '',
      dialedNumber: body['destinationNumber'] ?? '',
      direction: 'inbound',
    };
    this.emit('inbound', call);
    return call;
  }

  buildVoiceResponse(text: string): string {
    return buildSayResponse(text);
  }

  buildTransferVoiceResponse(toNumber: string, callId: string): string {
    return buildTransferResponse(toNumber, callId);
  }

  async transferCall(callId: string, toNumber: string): Promise<void> {
    const url = `https://voice.africastalking.com/call/transfer`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apiKey: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: this.username,
        sessionId: callId,
        phoneNumber: toNumber,
      }),
    });
    if (!response.ok) {
      throw new Error(`AT transfer failed: ${response.status}`);
    }
  }

  async endCall(callId: string): Promise<void> {
    const url = `https://voice.africastalking.com/call`;
    await fetch(url, {
      method: 'DELETE',
      headers: {
        apiKey: this.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: this.username,
        sessionId: callId,
      }),
    });
  }
}
