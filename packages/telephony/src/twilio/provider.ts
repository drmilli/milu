import { TelephonyProvider, type InboundCall } from '../provider.interface';

// Twilio adapter — roadmap item
export class TwilioProvider extends TelephonyProvider {
  handleInboundWebhook(body: Record<string, string>): InboundCall {
    const call: InboundCall = {
      callId: body['CallSid'] ?? '',
      callerNumber: body['From'] ?? '',
      dialedNumber: body['To'] ?? '',
      direction: 'inbound',
    };
    this.emit('inbound', call);
    return call;
  }

  buildVoiceResponse(text: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${text}</Say>
</Response>`;
  }

  async transferCall(_callId: string, _toNumber: string): Promise<void> {
    throw new Error('TwilioProvider.transferCall not yet implemented');
  }

  async endCall(_callId: string): Promise<void> {
    throw new Error('TwilioProvider.endCall not yet implemented');
  }
}
