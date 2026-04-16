import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { AgentPipeline } from '@milu/agent-core';
import { prisma } from '@milu/db';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { getSession } from './session-manager';

export function createCallSocketServer(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const callId = req.url?.split('/').pop();
    if (!callId) {
      ws.close(1008, 'Missing call ID');
      return;
    }

    const session = await getSession(callId);
    if (!session) {
      ws.close(1008, 'Session not found');
      return;
    }

    const kb = await prisma.knowledgeBase.findUnique({
      where: { businessId: session.businessId },
    });
    if (!kb) {
      ws.close(1011, 'Knowledge base not found');
      return;
    }

    const pipeline = new AgentPipeline(
      {
        businessId: session.businessId,
        knowledgeBase: kb as any,
      },
      {
        callId,
        businessId: session.businessId,
        callerNumber: session.callerNumber,
        turns: [],
        startedAt: new Date(session.startedAt),
      },
      {
        deepgramApiKey: env.DEEPGRAM_API_KEY,
        anthropicApiKey: env.ANTHROPIC_API_KEY,
        elevenLabsApiKey: env.ELEVENLABS_API_KEY,
      },
    );

    pipeline.on('response', (audio) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(audio);
    });

    pipeline.on('error', (err) => {
      logger.error({ callId, err }, 'Pipeline error');
    });

    pipeline.on('escalate', (id, summary) => {
      logger.info({ callId: id }, 'Call escalated');
      void summary;
    });

    pipeline.start();

    ws.on('message', (data) => {
      pipeline.receiveAudio(data as Buffer);
    });

    ws.on('close', () => {
      pipeline.end();
      logger.info({ callId }, 'WebSocket closed');
    });
  });
}
