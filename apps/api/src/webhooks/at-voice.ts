import type { Request, Response } from 'express';
import { AfricasTalkingProvider } from '@milu/telephony';
import { logger } from '../config/logger';
import { env } from '../config/env';

const provider = new AfricasTalkingProvider({
  apiKey: env.AT_API_KEY,
  username: env.AT_USERNAME,
});

export async function handleAtVoiceWebhook(req: Request, res: Response) {
  try {
    const call = provider.handleInboundWebhook(req.body as Record<string, string>);
    logger.info({ callId: call.callId, callerNumber: call.callerNumber }, 'Inbound call received');

    const wsUrl = `wss://${req.hostname}/ws/call/${call.callId}`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`;

    res.set('Content-Type', 'text/xml').send(xml);
  } catch (err) {
    logger.error(err, 'Error handling AT voice webhook');
    res.status(500).send('Internal server error');
  }
}
