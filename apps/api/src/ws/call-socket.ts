import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { logger } from '../config/logger';

export function createCallSocketServer(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const callId = req.url?.split('/').pop();
    if (!callId) {
      ws.close(1008, 'Missing call ID');
      return;
    }

    logger.info({ callId }, 'WebSocket call session opened');

    ws.on('message', (data: Buffer) => {
      logger.debug({ callId, bytes: data.length }, 'Audio chunk received');
      // AI pipeline integration point — connect @milu/agent-core here
    });

    ws.on('close', () => {
      logger.info({ callId }, 'WebSocket call session closed');
    });

    ws.on('error', (err) => {
      logger.error({ callId, err }, 'WebSocket error');
    });
  });
}
