import type { Request, Response } from 'express';
import { logger } from '../config/logger';

export async function handleAtVoiceWebhook(req: Request, res: Response) {
  try {
    const { sessionId, callerNumber } = req.body as Record<string, string>;
    logger.info({ sessionId, callerNumber }, 'Inbound AT voice call');

    const wsUrl = `wss://${req.hostname}/ws/call/${sessionId}`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${wsUrl}" /></Connect></Response>`;
    res.set('Content-Type', 'text/xml').send(xml);
  } catch (err) {
    logger.error(err, 'Error handling AT voice webhook');
    res.status(500).send('Internal server error');
  }
}
