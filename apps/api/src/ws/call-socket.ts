import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { eq } from 'drizzle-orm';
import { AgentPipeline } from '@milu/agent-core';
import { db, agentConfigs, businesses, knowledgeBases } from '../db';
import { env } from '../config/env';
import { logger } from '../config/logger';

export function createCallSocketServer(wss: WebSocketServer) {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const callId = url.pathname.split('/').pop();
    const businessId = url.searchParams.get('businessId');

    if (!callId || !businessId) {
      ws.close(1008, 'Missing call ID or business ID');
      return;
    }

    try {
      // 1. Fetch config for this business
      const [[agentRow], [bizRow], [kbRow]] = await Promise.all([
        db.select().from(agentConfigs).where(eq(agentConfigs.businessId, businessId)).limit(1),
        db.select({ name: businesses.name, industry: businesses.industry }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
        db.select().from(knowledgeBases).where(eq(knowledgeBases.businessId, businessId)).limit(1),
      ]);

      if (!bizRow || !kbRow) {
        ws.close(1008, 'Business or Knowledge Base not found');
        return;
      }

      // 2. Initialize Agent Pipeline
      const pipeline = new AgentPipeline(
        {
          businessId,
          knowledgeBase: {
            businessName: bizRow.name,
            industry: bizRow.industry ?? undefined,
            operatingHours: kbRow.operatingHours as any,
            faqs: kbRow.faqs as any,
            escalationNumber: kbRow.escalationNumber ?? undefined,
            voiceId: agentRow?.voiceId ?? undefined,
          },
        },
        {
          callId,
          businessId,
          callerNumber: '', // Will be updated if available
          turns: [],
          startedAt: new Date(),
        },
        {
          deepgramApiKey: env.DEEPGRAM_API_KEY!,
          anthropicApiKey: env.ANTHROPIC_API_KEY!,
          elevenLabsApiKey: env.ELEVENLABS_API_KEY!,
        }
      );

      logger.info({ callId, businessId }, 'AI Agent Pipeline initialized for WebSocket session');

      // 3. Handle pipeline events
      pipeline.on('transcript', (text: string, intent: string) => {
        logger.info({ callId, text, intent }, 'Transcript received');
        ws.send(JSON.stringify({ type: 'transcript', text, intent }));
      });

      pipeline.on('response', (audio: Buffer) => {
        logger.debug({ callId, bytes: audio.length }, 'Sending audio response');
        ws.send(audio);
      });

      pipeline.on('error', (err: Error) => {
        logger.error({ callId, err }, 'Pipeline error');
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      });

      pipeline.start();

      // 4. Handle incoming audio from WebSocket
      ws.on('message', (data: Buffer) => {
        // Assume raw audio chunks from telephony provider
        pipeline.receiveAudio(data);
      });

      ws.on('close', () => {
        pipeline.end();
        logger.info({ callId }, 'WebSocket call session closed');
      });

    } catch (err) {
      logger.error({ callId, err }, 'Failed to initialize call session');
      ws.close(1011, 'Internal server error');
    }
  });
}
