import type { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { and, desc, eq, ne } from 'drizzle-orm';
import {
  db, calls, contacts, agentConfigs, businesses, knowledgeBases,
  knowledgeDocuments, transcripts, appointments, orders, escalations,
  catalogItems, businessSettings,
} from '../db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getElevenLabsVoiceId } from '../config/voices';
import { notifyBusinessOwners } from '../services/notifications';
import { sendEscalationAlert } from '../services/whatsapp';
import twilio from 'twilio';

// ─── Voice mapping ─────────────────────────────────────────────────────────────

type RealtimeVoice = 'alloy' | 'ash' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'ballad';

function mapVoice(voiceId: string | null | undefined): RealtimeVoice {
  const v = (voiceId ?? '').toLowerCase().trim();
  const m: Record<string, RealtimeVoice> = {
    alloy: 'alloy', ash: 'ash', coral: 'coral', echo: 'echo',
    sage: 'sage', shimmer: 'shimmer', verse: 'verse', ballad: 'ballad',
    nova: 'coral', onyx: 'echo', fable: 'verse',
    amaka: 'coral', chidi: 'echo', ngozi: 'shimmer',
    aisha: 'alloy', tunde: 'ash', kola: 'verse',
  };
  return m[v] ?? 'coral';
}

// ─── ElevenLabs TTS streaming ─────────────────────────────────────────────────

async function streamElevenLabsTts(
  text: string,
  voiceId: string,
  controller: AbortController,
  onChunk: (chunk: Uint8Array) => void,
): Promise<void> {
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) return;

  let res: Response;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=ulaw_8000`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: controller.signal,
      },
    );
  } catch {
    return;
  }

  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => '');
    logger.warn({ status: res.status, err: err.slice(0, 200), voiceId }, 'ElevenLabs TTS stream failed');
    return;
  }

  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || controller.signal.aborted) break;
      if (value?.length) onChunk(value);
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Plan helper ───────────────────────────────────────────────────────────────

function effectiveTier(biz: { subscriptionTier: string | null; createdAt: Date }) {
  const tier = (biz.subscriptionTier ?? 'STARTER') as 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  const isTrial = tier === 'STARTER' && new Date() < new Date(biz.createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);
  return isTrial ? 'GROWTH' : tier;
}

function opsEnabled(biz: { subscriptionTier: string | null; createdAt: Date }) {
  return effectiveTier(biz) !== 'STARTER';
}

// ─── Twilio REST client ────────────────────────────────────────────────────────

function getTwilioClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

// ─── Context loader ────────────────────────────────────────────────────────────

type CallContext = {
  callRow: typeof calls.$inferSelect;
  agentRow: typeof agentConfigs.$inferSelect | undefined;
  bizRow: typeof businesses.$inferSelect | undefined;
  kbRow: { faqs: unknown; websiteSummary: string | null; escalationNumber: string | null } | undefined;
  kbDocs: { summary: string | null }[];
  contactRow: { id: string; name: string | null; location: string | null } | undefined;
  previousSnippets: string[];
  catalogSummary: string | null;
};

async function loadCallContext(callId: string): Promise<CallContext | null> {
  const [callRow] = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!callRow) return null;

  const [agentRow, bizRow, kbRow, kbDocs, contactRow, previousSnippets, catalogRows] = await Promise.all([
    db.select().from(agentConfigs).where(eq(agentConfigs.businessId, callRow.businessId)).limit(1).then(r => r[0]),
    db.select().from(businesses).where(eq(businesses.id, callRow.businessId)).limit(1).then(r => r[0]),
    db.select({ faqs: knowledgeBases.faqs, websiteSummary: knowledgeBases.websiteSummary, escalationNumber: knowledgeBases.escalationNumber })
      .from(knowledgeBases).where(eq(knowledgeBases.businessId, callRow.businessId)).limit(1).then(r => r[0]),
    db.select({ summary: knowledgeDocuments.summary })
      .from(knowledgeDocuments).where(eq(knowledgeDocuments.businessId, callRow.businessId)).limit(5),
    callRow.contactId
      ? db.select({ id: contacts.id, name: contacts.name, location: contacts.location })
        .from(contacts).where(eq(contacts.id, callRow.contactId)).limit(1).then(r => r[0])
      : callRow.callerNumber
        ? db.select({ id: contacts.id, name: contacts.name, location: contacts.location })
          .from(contacts).where(and(eq(contacts.businessId, callRow.businessId), eq(contacts.phone, callRow.callerNumber))).limit(1).then(r => r[0])
        : Promise.resolve(undefined),
    callRow.callerNumber
      ? db.select({ speaker: transcripts.speaker, text: transcripts.text, createdAt: transcripts.createdAt })
        .from(transcripts)
        .leftJoin(calls, eq(calls.id, transcripts.callId))
        .where(and(eq(calls.businessId, callRow.businessId), eq(calls.callerNumber, callRow.callerNumber), ne(calls.id, callId)))
        .orderBy(desc(transcripts.createdAt))
        .limit(8)
        .then(rows => rows.slice().reverse().map(r => `${r.speaker}: ${r.text}`))
      : Promise.resolve([] as string[]),
    db.select({ type: catalogItems.type, name: catalogItems.name, price: catalogItems.price, currency: catalogItems.currency, isAvailable: catalogItems.isAvailable, availabilityNote: catalogItems.availabilityNote })
      .from(catalogItems).where(eq(catalogItems.businessId, callRow.businessId)).limit(25),
  ]);

  let catalogSummary: string | null = null;
  if (catalogRows.length) {
    const available = catalogRows.filter(r => r.isAvailable);
    const unavailable = catalogRows.filter(r => !r.isAvailable);
    const fmt = (r: typeof catalogRows[number]) => {
      const price = typeof r.price === 'number' ? ` — ${r.currency ?? 'NGN'} ${r.price}` : '';
      const note = r.availabilityNote ? ` (${r.availabilityNote})` : '';
      return `${r.type}: ${r.name}${price}${note}`;
    };
    const parts: string[] = [];
    if (available.length) parts.push(`Available:\n${available.map(fmt).join('\n')}`);
    if (unavailable.length) parts.push(`Unavailable:\n${unavailable.map(fmt).join('\n')}`);
    catalogSummary = parts.join('\n\n');
  }

  return { callRow, agentRow, bizRow, kbRow, kbDocs, contactRow, previousSnippets, catalogSummary };
}

// ─── System instructions ──────────────────────────────────────────────────────

function buildInstructions(ctx: CallContext): string {
  const { callRow, agentRow, bizRow, kbRow, kbDocs, contactRow, previousSnippets, catalogSummary } = ctx;
  const callerName = callRow.callerName ?? contactRow?.name ?? null;
  const callerLocation = callRow.callerLocation ?? contactRow?.location ?? null;
  const agentName = agentRow?.name ?? 'your agent';
  const bizName = bizRow?.name ?? 'this business';
  const tone = agentRow?.tone ?? 'friendly and professional';
  const faqs: { question: string; answer: string }[] = (kbRow?.faqs as any) ?? [];

  return [
    `You are ${agentName}, a phone customer service agent for "${bizName}".`,
    `Tone: ${tone}. Speak naturally as on a real phone call — concise, 1 to 3 short sentences max per turn.`,
    `Never use bullet points, numbered lists, or markdown. Never start with filler words like "Alright", "Sure", "Okay", "Certainly".`,
    `Start directly with your answer or question.`,
    callerName ? `Caller's name: ${callerName}.` : null,
    callerLocation ? `Calling from: ${callerLocation}.` : null,
    callRow.callerNumber ? `Phone: ${callRow.callerNumber}.` : null,
    previousSnippets.length
      ? `Previous conversations with this caller (most recent last):\n${previousSnippets.join('\n')}`
      : null,
    `If the customer seems frustrated or upset, acknowledge their feelings first before answering.`,
    `Never reveal you are an AI unless directly asked.`,
    `Respond in the same language or dialect the customer uses — English, Nigerian Pidgin, Yoruba, Igbo, Hausa. Match their style naturally.`,
    bizRow && kbRow?.websiteSummary ? `About ${bizName}: ${kbRow.websiteSummary.slice(0, 600)}` : null,
    faqs.length ? `Common questions:\n${faqs.slice(0, 10).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n')}` : null,
    kbDocs.length ? `Additional info: ${kbDocs.slice(0, 3).map(d => (d.summary ?? '').slice(0, 300)).join(' ')}` : null,
    catalogSummary
      ? `Products & services catalog (source of truth):\n${catalogSummary}\nOnly mention items and prices that appear in the catalog above. If an item is not listed, say you will confirm and follow up.`
      : null,
    ``,
    `START OF CALL: Greet the caller immediately when the call connects.`,
    callerName
      ? `Greet with: "Welcome back, ${callerName}! How can I help you today?"`
      : `Greet with the agent's standard greeting, then ask how you can help.`,
    ``,
    `APPOINTMENTS: When the customer wants to book an appointment, collect the date, time, service type, and name. Then call the create_appointment function.`,
    `ORDERS: When the customer wants to place an order, collect items, quantities, delivery address, and name. Then call the create_order function.`,
    `After completing an appointment or order, confirm the details and ask if there is anything else you can help with.`,
    kbRow?.escalationNumber
      ? `ESCALATION: If you cannot help or the customer requests a human agent, call the escalate_to_human function.`
      : `If you cannot help, let the customer know the team will follow up.`,
    `END CALL: When the conversation is naturally complete and the customer is satisfied, call the end_call function. Do not just say goodbye — call the function.`,
  ].filter(Boolean).join('\n');
}

// ─── Function tool definitions ────────────────────────────────────────────────

function buildTools(ops: boolean, canEscalate: boolean): object[] {
  const tools: object[] = [];

  if (ops) {
    tools.push({
      type: 'function',
      name: 'create_appointment',
      description: 'Book an appointment when you have collected all required details from the customer.',
      parameters: {
        type: 'object',
        properties: {
          scheduledAt: { type: 'string', description: 'ISO 8601 datetime with timezone offset' },
          durationMinutes: { type: 'integer', description: 'Duration in minutes, default 30' },
          serviceType: { type: 'string', description: 'Type of service being booked' },
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['scheduledAt', 'customerName'],
      },
    });

    tools.push({
      type: 'function',
      name: 'create_order',
      description: 'Record a customer order when you have collected all required details.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                qty: { type: 'integer' },
                price: { type: 'number' },
              },
              required: ['name', 'qty'],
            },
          },
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          deliveryAddress: { type: 'string' },
          notes: { type: 'string' },
          currency: { type: 'string', description: 'Default NGN' },
          totalAmount: { type: 'number' },
        },
        required: ['items', 'customerName'],
      },
    });
  }

  if (canEscalate) {
    tools.push({
      type: 'function',
      name: 'escalate_to_human',
      description: 'Transfer the call to a human agent when you cannot help or the customer explicitly requests one.',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Reason for escalation' } },
        required: ['reason'],
      },
    });
  }

  tools.push({
    type: 'function',
    name: 'end_call',
    description: 'End the call after saying goodbye when the conversation is naturally complete.',
    parameters: { type: 'object', properties: {}, required: [] },
  });

  return tools;
}

// ─── Main WebSocket handler ───────────────────────────────────────────────────

export function handleTwilioVoiceStream(ws: WebSocket, _req: IncomingMessage) {
  let streamSid = '';
  let callSid = '';
  let callId = '';
  let openAiWs: WebSocket | null = null;
  let ctx: CallContext | null = null;

  // Session readiness flags — both must be true before we configure OpenAI session
  let contextLoaded = false;
  let sessionCreated = false;
  let sessionConfigured = false;

  // Audio buffer: holds inbound audio until session is configured
  const audioQueue: string[] = [];

  // Accumulated transcripts per turn
  let agentTurnText = '';

  // ElevenLabs TTS state (used when cloned voice is active)
  let elevenLabsController: AbortController | null = null;
  let elevenLabsTurnText = '';

  // ── Send helpers ────────────────────────────────────────────────────────────

  function toOpenAI(obj: object) {
    if (openAiWs?.readyState === WebSocket.OPEN) openAiWs.send(JSON.stringify(obj));
  }

  function toTwilio(obj: object) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function sendAudio(payload: string) {
    toTwilio({ event: 'media', streamSid, media: { payload } });
  }

  function clearAudio() {
    toTwilio({ event: 'clear', streamSid });
  }

  // ── Configure OpenAI session once both context and session.created are ready ─

  function maybeConfigureSession() {
    if (!contextLoaded || !sessionCreated || sessionConfigured || !ctx) return;
    sessionConfigured = true;

    const { bizRow, agentRow, kbRow } = ctx;
    const ops = bizRow ? opsEnabled(bizRow) : true;
    const canEscalate = !!kbRow?.escalationNumber;
    const elevenLabsVoiceId = agentRow?.clonedVoiceId ?? getElevenLabsVoiceId(agentRow?.voiceId);
    const useElevenLabs = !!(elevenLabsVoiceId && env.ELEVENLABS_API_KEY);

    toOpenAI({
      type: 'session.update',
      session: {
        instructions: buildInstructions(ctx),
        ...(useElevenLabs
          ? {
              modalities: ['text'],
              input_audio_format: 'g711_ulaw',
            }
          : {
              voice: mapVoice(agentRow?.voiceId),
              input_audio_format: 'g711_ulaw',
              output_audio_format: 'g711_ulaw',
            }),
        input_audio_transcription: { model: 'gpt-4o-transcribe' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
        tools: buildTools(ops, canEscalate),
        tool_choice: 'auto',
      },
    });
  }

  // ── Flush buffered audio after session is ready ──────────────────────────────

  function flushAudioQueue() {
    for (const payload of audioQueue) {
      toOpenAI({ type: 'input_audio_buffer.append', audio: payload });
    }
    audioQueue.length = 0;
  }

  // ── Hang up via Twilio REST API ──────────────────────────────────────────────

  async function hangUp(delayMs = 2500) {
    await new Promise(r => setTimeout(r, delayMs));
    const client = getTwilioClient();
    if (client && callSid) {
      await client.calls(callSid).update({ status: 'completed' }).catch((err: Error) =>
        logger.warn({ err, callSid }, 'Failed to hang up via Twilio REST'),
      );
    }
    openAiWs?.close();
  }

  // ── Execute function calls ────────────────────────────────────────────────────

  async function executeFn(name: string, args: Record<string, any>): Promise<string> {
    if (!ctx) return JSON.stringify({ success: false });
    const { callRow } = ctx;

    if (name === 'create_appointment') {
      const scheduledAt = new Date(args.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) return JSON.stringify({ success: false, error: 'Invalid date/time' });

      const [row] = await db.insert(appointments).values({
        businessId: callRow.businessId,
        contactId: callRow.contactId ?? undefined,
        callId,
        scheduledAt,
        duration: Math.max(5, Math.min(240, args.durationMinutes ?? 30)),
        serviceType: args.serviceType,
        customerPhone: args.customerPhone ?? callRow.callerNumber ?? '',
        customerName: args.customerName,
        notes: args.notes,
      }).returning({ id: appointments.id });

      if (args.customerName && callRow.contactId) {
        await db.update(contacts).set({ name: args.customerName, updatedAt: new Date() })
          .where(eq(contacts.id, callRow.contactId)).catch(() => null);
      }

      await notifyBusinessOwners(callRow.businessId, 'New Appointment',
        `Booked for ${args.customerName ?? args.customerPhone} on ${scheduledAt.toLocaleString()}`).catch(() => null);

      logger.info({ callId, appointmentId: row?.id }, 'Appointment created via Realtime');
      return JSON.stringify({ success: true, appointmentId: row?.id });
    }

    if (name === 'create_order') {
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
      const items = ((args.items ?? []) as any[]).map(i => ({ name: i.name, qty: i.qty, price: i.price ?? 0 }));
      const totalAmount = typeof args.totalAmount === 'number'
        ? args.totalAmount
        : items.reduce((s, i) => s + i.price * i.qty, 0) || undefined;

      const [row] = await db.insert(orders).values({
        businessId: callRow.businessId,
        contactId: callRow.contactId ?? undefined,
        callId,
        orderNumber,
        customerPhone: args.customerPhone ?? callRow.callerNumber ?? '',
        customerName: args.customerName,
        items,
        totalAmount,
        currency: args.currency ?? 'NGN',
        deliveryAddress: args.deliveryAddress,
        notes: args.notes,
      }).returning({ id: orders.id });

      if (args.customerName && callRow.contactId) {
        await db.update(contacts).set({ name: args.customerName, updatedAt: new Date() })
          .where(eq(contacts.id, callRow.contactId)).catch(() => null);
      }

      await notifyBusinessOwners(callRow.businessId, 'New Order',
        `Order #${orderNumber} from ${args.customerName ?? args.customerPhone}`).catch(() => null);

      logger.info({ callId, orderId: row?.id, orderNumber }, 'Order created via Realtime');
      return JSON.stringify({ success: true, orderId: row?.id, orderNumber });
    }

    if (name === 'escalate_to_human') {
      const [existing] = await db.select({ id: escalations.id }).from(escalations)
        .where(eq(escalations.callId, callId)).limit(1);
      if (!existing) {
        await db.insert(escalations).values({
          businessId: callRow.businessId,
          callId,
          reason: 'Agent escalation',
          summary: (args.reason ?? '').slice(0, 600),
        }).catch(() => null);
      }

      const [settings] = await db.select({ whatsappNumber: businessSettings.whatsappNumber, whatsappVerified: businessSettings.whatsappVerified })
        .from(businessSettings).where(eq(businessSettings.businessId, callRow.businessId)).limit(1);
      if (settings?.whatsappVerified && settings.whatsappNumber) {
        await sendEscalationAlert(settings.whatsappNumber, callRow.callerNumber ?? '', args.reason ?? '').catch(() => null);
      }

      await notifyBusinessOwners(callRow.businessId, 'Call Escalated',
        `Caller ${callRow.callerNumber} needs your attention. ${args.reason ?? ''}`).catch(() => null);

      await db.update(calls).set({ status: 'COMPLETED', resolution: 'HUMAN', endedAt: new Date() })
        .where(eq(calls.id, callId)).catch(() => null);

      hangUp(3000).catch(() => null);
      return JSON.stringify({ success: true });
    }

    if (name === 'end_call') {
      await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() })
        .where(eq(calls.id, callId)).catch(() => null);
      hangUp(2500).catch(() => null);
      return JSON.stringify({ success: true });
    }

    return JSON.stringify({ success: false, error: 'Unknown function' });
  }

  // ── OpenAI Realtime event handler ─────────────────────────────────────────────

  async function onOpenAIMessage(data: Buffer) {
    let event: any;
    try { event = JSON.parse(data.toString()); } catch { return; }

    switch (event.type) {
      case 'session.created': {
        sessionCreated = true;
        maybeConfigureSession();
        break;
      }

      case 'session.updated': {
        // Session is fully configured — flush any buffered audio and trigger greeting
        flushAudioQueue();
        toOpenAI({ type: 'response.create' });
        break;
      }

      case 'response.audio.delta': {
        if (event.delta) sendAudio(event.delta);
        break;
      }

      case 'response.audio_transcript.delta': {
        agentTurnText += event.delta ?? '';
        break;
      }

      case 'response.text.delta': {
        const delta = event.delta ?? '';
        elevenLabsTurnText += delta;
        agentTurnText += delta;
        break;
      }

      case 'response.text.done': {
        const text = (event.text ?? elevenLabsTurnText).trim();
        elevenLabsTurnText = '';
        const elevenLabsId = ctx?.agentRow?.clonedVoiceId ?? getElevenLabsVoiceId(ctx?.agentRow?.voiceId);
        if (text && elevenLabsId && env.ELEVENLABS_API_KEY) {
          elevenLabsController?.abort();
          const controller = new AbortController();
          elevenLabsController = controller;
          streamElevenLabsTts(text, elevenLabsId, controller, (chunk) => {
            if (!controller.signal.aborted) {
              sendAudio(Buffer.from(chunk).toString('base64'));
            }
          }).catch(err => logger.warn({ err, callId }, 'ElevenLabs TTS error'));
        }
        break;
      }

      case 'response.audio_transcript.done':
      case 'response.done': {
        const text = (event.transcript ?? agentTurnText).trim();
        agentTurnText = '';
        if (text && callId) {
          await db.insert(transcripts).values({ callId, speaker: 'agent', text }).catch(() => null);
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const text = (event.transcript ?? '').trim();
        if (text && callId) {
          await db.insert(transcripts).values({ callId, speaker: 'caller', text }).catch(() => null);
        }
        break;
      }

      case 'input_audio_buffer.speech_started': {
        // Barge-in: cancel current response and clear Twilio audio buffer
        toOpenAI({ type: 'response.cancel' });
        clearAudio();
        agentTurnText = '';
        elevenLabsTurnText = '';
        elevenLabsController?.abort();
        elevenLabsController = null;
        break;
      }

      case 'response.function_call_arguments.done': {
        const fnName = event.name as string;
        const fnCallId = event.call_id as string;
        let fnArgs: Record<string, any> = {};
        try { fnArgs = JSON.parse(event.arguments ?? '{}'); } catch { /* ignore */ }

        logger.info({ callId, fnName }, 'Realtime function call');

        let result: string;
        try {
          result = await executeFn(fnName, fnArgs);
        } catch (err) {
          logger.error({ err, fnName, callId }, 'Function call execution failed');
          result = JSON.stringify({ success: false, error: 'Internal error' });
        }

        toOpenAI({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: fnCallId, output: result },
        });
        toOpenAI({ type: 'response.create' });
        break;
      }

      case 'error': {
        logger.error({ error: event.error, callId }, 'OpenAI Realtime API error');
        break;
      }
    }
  }

  // ── Connect to OpenAI Realtime API ──────────────────────────────────────────

  function connectToOpenAI() {
    if (!env.OPENAI_API_KEY) {
      logger.error('No OPENAI_API_KEY — cannot start Realtime session');
      ws.close();
      return;
    }

    const oaWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    oaWs.on('open', () => logger.info({ callId }, 'OpenAI Realtime connected'));
    oaWs.on('message', (data: Buffer) => onOpenAIMessage(data).catch(err => logger.error({ err }, 'OpenAI message handler error')));
    oaWs.on('error', err => logger.error({ err, callId }, 'OpenAI Realtime error'));
    oaWs.on('close', () => logger.info({ callId }, 'OpenAI Realtime disconnected'));

    openAiWs = oaWs;
  }

  // ── Twilio WebSocket event handlers ──────────────────────────────────────────

  ws.on('message', async (data: Buffer) => {
    let msg: any;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg.event) {
      case 'start': {
        streamSid = msg.start.streamSid ?? '';
        callSid = msg.start.callSid ?? '';
        callId = msg.start.customParameters?.callId ?? '';

        logger.info({ streamSid, callSid, callId }, 'Twilio Media Stream started');

        if (!callId) { logger.error('Stream missing callId parameter'); ws.close(); return; }

        // Load DB context and connect to OpenAI in parallel
        loadCallContext(callId)
          .then(loaded => {
            ctx = loaded;
            contextLoaded = true;
            if (!ctx) { logger.error({ callId }, 'Call not found'); ws.close(); return; }
            maybeConfigureSession();
          })
          .catch(err => logger.error({ err, callId }, 'Failed to load call context'));

        connectToOpenAI();
        break;
      }

      case 'media': {
        const payload: string = msg.media?.payload ?? '';
        if (!payload) break;
        if (!sessionConfigured) {
          // Buffer until OpenAI session is ready
          audioQueue.push(payload);
        } else {
          toOpenAI({ type: 'input_audio_buffer.append', audio: payload });
        }
        break;
      }

      case 'stop': {
        logger.info({ streamSid, callId }, 'Twilio stream stopped');
        openAiWs?.close();
        if (callId) {
          await db.update(calls)
            .set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() })
            .where(and(eq(calls.id, callId), eq(calls.status, 'ACTIVE')))
            .catch(() => null);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    openAiWs?.close();
    logger.info({ streamSid, callId }, 'Twilio WebSocket closed');
  });

  ws.on('error', err => {
    logger.error({ err, streamSid }, 'Twilio WebSocket error');
    openAiWs?.close();
  });
}
