import type { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { and, desc, eq, ne } from 'drizzle-orm';
import {
  db, calls, contacts, agentConfigs, businesses, knowledgeBases,
  knowledgeDocuments, transcripts, appointments, orders, escalations,
  catalogItems, businessSettings,
} from '../db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getElevenLabsVoiceId, ELEVENLABS_VOICES, DEFAULT_VOICE } from '../config/voices';
import { notifyBusinessOwners } from '../services/notifications';
import { sendEscalationAlert } from '../services/whatsapp';
import twilio from 'twilio';

// ─── ElevenLabs voice mapping ──────────────────────────────────────────────────

function resolveElevenLabsVoiceId(voiceId: string | null | undefined, clonedVoiceId: string | null | undefined): string {
  if (clonedVoiceId) return clonedVoiceId;
  const mapped = getElevenLabsVoiceId(voiceId);
  if (mapped) return mapped;
  return ELEVENLABS_VOICES[DEFAULT_VOICE] ?? '6aDn1KB0hjpdcocrUkmq'; // tiff default
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
    `You are ${agentName}, a phone customer service agent for "${bizName}". Your name is ${agentName} — never call yourself "Milu" or any other name.`,
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
      ? `Products & services catalog (source of truth):\n${catalogSummary}\nOnly mention items and prices that appear in the catalog above.`
      : null,
    ``,
    `APPOINTMENTS: When the customer wants to book an appointment, collect the date, time, service type, and name. Then call the create_appointment function. After booking, confirm with the customer and ask if there is anything else you can help with — do NOT end the call immediately.`,
    `ORDERS: When the customer wants to place an order, collect all items, quantities, delivery address, and their name. Then call the create_order function. After the order is placed, confirm the details and ask if there is anything else — do NOT end the call immediately.`,
    kbRow?.escalationNumber
      ? `ESCALATION: If you cannot help or the customer requests a human agent, call the escalate_to_human function.`
      : `If you cannot help, let the customer know the team will follow up.`,
    `END CALL: When the conversation is naturally complete and the customer is satisfied, call the end_call function. Do not just say goodbye — call the function.`,
  ].filter(Boolean).join('\n');
}

// ─── Chat API tool definitions ─────────────────────────────────────────────────

function buildChatTools(ops: boolean, canEscalate: boolean) {
  const tools: object[] = [];

  if (ops) {
    tools.push({
      type: 'function',
      function: {
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
      },
    });

    tools.push({
      type: 'function',
      function: {
        name: 'create_order',
        description: 'Place an order when you have collected all required details from the customer.',
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
      },
    });
  }

  if (canEscalate) {
    tools.push({
      type: 'function',
      function: {
        name: 'escalate_to_human',
        description: 'Transfer the call to a human agent when you cannot help or the customer explicitly requests one.',
        parameters: {
          type: 'object',
          properties: { reason: { type: 'string', description: 'Reason for escalation' } },
          required: ['reason'],
        },
      },
    });
  }

  tools.push({
    type: 'function',
    function: {
      name: 'end_call',
      description: 'End the call after saying goodbye when the conversation is naturally complete.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  });

  return tools;
}

// ─── Main WebSocket handler ───────────────────────────────────────────────────

export function handleTwilioVoiceStream(ws: WebSocket, req: IncomingMessage) {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ?? 'https';
  const host = req.headers['host'] ?? '';
  const baseUrl = host ? `${proto}://${host}` : '';

  let streamSid = '';
  let callSid = '';
  let callId = '';
  let ctx: CallContext | null = null;

  // Deepgram STT connection
  let dgConnection: ReturnType<ReturnType<typeof createClient>['listen']['live']> | null = null;
  let dgReady = false;

  // Audio buffer until Deepgram is ready
  const audioQueue: Buffer[] = [];

  // Conversation state
  const conversationHistory: { role: string; content: string }[] = [];
  let systemInstructions = '';
  let ops = true;
  let canEscalate = false;
  let agentVoiceId: string | null | undefined = null;
  let agentClonedVoiceId: string | null | undefined = null;

  // TTS / barge-in state
  let agentSpeaking = false;
  let ttsAbortController: AbortController | null = null;

  // ── Send helpers ────────────────────────────────────────────────────────────

  function toTwilio(obj: object) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function sendAudio(b64Payload: string) {
    toTwilio({ event: 'media', streamSid, media: { payload: b64Payload } });
  }

  function clearAudio() {
    toTwilio({ event: 'clear', streamSid });
  }

  // ── Hang up via Twilio REST ─────────────────────────────────────────────────

  async function hangUp(delayMs = 2500) {
    await new Promise(r => setTimeout(r, delayMs));
    const client = getTwilioClient();
    if (client && callSid) {
      await client.calls(callSid).update({ status: 'completed' }).catch((err: Error) =>
        logger.warn({ err, callSid }, 'Failed to hang up via Twilio REST'),
      );
    }
    dgConnection?.finish();
    ws.close();
  }

  // ── Fallback to gather/respond if Deepgram fails ────────────────────────────

  function fallbackToGatherPath() {
    if (!callSid || !baseUrl) { ws.close(); return; }
    logger.warn({ callId, callSid }, 'Deepgram failed — redirecting call to gather/respond path');
    const client = getTwilioClient();
    if (!client) { ws.close(); return; }
    const url = `${baseUrl}/webhooks/twilio/voice/fallback-greeting?callId=${encodeURIComponent(callId)}`;
    client.calls(callSid).update({ url, method: 'POST' })
      .then(() => ws.close())
      .catch(err => { logger.error({ err, callSid }, 'Fallback redirect failed'); ws.close(); });
  }

  // ── Execute function calls ─────────────────────────────────────────────────

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

      logger.info({ callId, appointmentId: row?.id }, 'Appointment created via stream');
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

      logger.info({ callId, orderId: row?.id, orderNumber }, 'Order created via stream');
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

  // ── Call LLM (OpenAI Chat API with function calling) ──────────────────────

  let callEnded = false;

  async function callLLM(userText: string): Promise<string> {
    if (!env.OPENAI_API_KEY) return "I'm sorry, I'm having trouble responding right now.";
    if (callEnded) return '';

    conversationHistory.push({ role: 'user', content: userText });
    const tools = buildChatTools(ops, canEscalate);

    for (let iteration = 0; iteration < 5; iteration++) {
      if (callEnded) return '';

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemInstructions },
            ...conversationHistory,
          ],
          tools,
          tool_choice: 'auto',
          temperature: 0.6,
          max_tokens: 200,
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        logger.warn({ status: res.status, err: err.slice(0, 200) }, 'OpenAI Chat API error');
        return "I'm having trouble responding right now. Please try again.";
      }

      const data = await res.json() as any;
      const message = data.choices?.[0]?.message;
      if (!message) break;

      if (message.tool_calls?.length) {
        // Push assistant message with tool_calls exactly as returned by API
        conversationHistory.push(message);

        for (const tc of message.tool_calls) {
          let fnArgs: Record<string, any> = {};
          try { fnArgs = JSON.parse(tc.function.arguments ?? '{}'); } catch { /* ignore */ }
          logger.info({ callId, fnName: tc.function.name }, 'Function call');

          const result = await executeFn(tc.function.name, fnArgs).catch(err => {
            logger.error({ err, fnName: tc.function.name }, 'Function execution error');
            return JSON.stringify({ success: false });
          });

          // Include tool_call_id so OpenAI knows which call this result belongs to
          conversationHistory.push({ role: 'tool', tool_call_id: tc.id, content: result } as any);

          // If end_call or escalate was triggered, stop processing
          if (tc.function.name === 'end_call' || tc.function.name === 'escalate_to_human') {
            callEnded = true;
            return '';
          }
        }
        continue;
      }

      const text = (message.content ?? '').trim();
      if (text) conversationHistory.push({ role: 'assistant', content: text });
      return text;
    }

    return "I'm sorry, I couldn't process that. Please try again.";
  }

  // ── Stream TTS → Twilio (ElevenLabs primary, OpenAI fallback) ───────────────

  async function streamElevenLabsTTS(text: string, abort: AbortController): Promise<boolean> {
    if (!env.ELEVENLABS_API_KEY) return false;

    const voiceId = resolveElevenLabsVoiceId(agentVoiceId, agentClonedVoiceId);
    logger.info({ callId, voiceId, textLen: text.length }, 'Streaming ElevenLabs TTS');

    let res: Response;
    try {
      res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=ulaw_8000&optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
              stability: 0.35,
              similarity_boost: 0.8,
              style: 0.2,
              use_speaker_boost: true,
            },
          }),
          signal: abort.signal,
        },
      );
    } catch {
      return false;
    }

    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => '');
      logger.warn({ status: res.status, err: err.slice(0, 200), voiceId }, 'ElevenLabs TTS failed');
      return false;
    }

    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || abort.signal.aborted) break;
        if (value?.length) sendAudio(Buffer.from(value).toString('base64'));
      }
    } finally {
      reader.releaseLock();
    }
    return true;
  }

  async function streamOpenAITTS(text: string, abort: AbortController): Promise<boolean> {
    if (!env.OPENAI_API_KEY) return false;

    logger.info({ callId, textLen: text.length }, 'Falling back to OpenAI TTS');
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'tts-1',
          voice: 'nova',
          input: text,
          response_format: 'ulaw',
          speed: 1.0,
        }),
        signal: abort.signal,
      });
    } catch {
      return false;
    }

    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => '');
      logger.warn({ status: res.status, err: err.slice(0, 200) }, 'OpenAI TTS fallback failed');
      return false;
    }

    const reader = res.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || abort.signal.aborted) break;
        if (value?.length) sendAudio(Buffer.from(value).toString('base64'));
      }
    } finally {
      reader.releaseLock();
    }
    return true;
  }

  async function streamTTS(text: string): Promise<void> {
    if (!text.trim() || ws.readyState !== WebSocket.OPEN) return;

    if (ttsAbortController) ttsAbortController.abort();
    ttsAbortController = new AbortController();
    agentSpeaking = true;

    try {
      const ok = await streamElevenLabsTTS(text, ttsAbortController)
        || await streamOpenAITTS(text, ttsAbortController);
      if (!ok) logger.error({ callId }, 'All TTS providers failed — caller will hear silence');
    } finally {
      agentSpeaking = false;
    }
  }

  // ── Handle a final transcript from Deepgram ────────────────────────────────

  async function handleCallerSpeech(text: string) {
    if (!ctx) return;
    logger.info({ callId, text: text.slice(0, 200) }, 'Caller speech final');

    await db.insert(transcripts).values({ callId, speaker: 'caller', text }).catch(() => null);

    try {
      const reply = await callLLM(text);
      if (!reply) return;

      await db.insert(transcripts).values({ callId, speaker: 'agent', text: reply }).catch(() => null);
      await streamTTS(reply);
    } catch (err) {
      logger.error({ err, callId }, 'Error handling caller speech');
    }
  }

  // ── Connect to Deepgram STT ────────────────────────────────────────────────

  function connectToDeepgram() {
    if (!env.DEEPGRAM_API_KEY) {
      logger.error({ callId }, 'No DEEPGRAM_API_KEY — falling back to gather path');
      fallbackToGatherPath();
      return;
    }

    const dgClient = createClient(env.DEEPGRAM_API_KEY);
    const conn = dgClient.listen.live({
      model: 'nova-2',
      language: 'multi',
      smart_format: true,
      interim_results: true,
      endpointing: 300,
      utterance_end_ms: 1000,
      encoding: 'mulaw',
      sample_rate: 8000,
    });

    conn.on(LiveTranscriptionEvents.Open, () => {
      logger.info({ callId }, 'Deepgram STT connected');
      dgReady = true;
      for (const chunk of audioQueue) {
        const ab = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
        conn.send(ab);
      }
      audioQueue.length = 0;
    });

    conn.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const text: string = data.channel?.alternatives?.[0]?.transcript ?? '';
      const isFinal: boolean = data.is_final ?? false;
      const speechFinal: boolean = data.speech_final ?? false;

      // Barge-in: interrupt agent speech when caller starts talking
      if (text && agentSpeaking) {
        ttsAbortController?.abort();
        clearAudio();
        agentSpeaking = false;
      }

      if (isFinal && speechFinal && text.trim()) {
        handleCallerSpeech(text.trim()).catch(err =>
          logger.error({ err, callId }, 'handleCallerSpeech error'),
        );
      }
    });

    conn.on(LiveTranscriptionEvents.Error, (err: any) => {
      logger.error({ err, callId }, 'Deepgram STT error');
      fallbackToGatherPath();
    });

    conn.on(LiveTranscriptionEvents.Close, () => {
      logger.info({ callId }, 'Deepgram STT closed');
    });

    dgConnection = conn;
  }

  // ── Initial greeting (uses configured script — no LLM call needed) ──────────

  async function sendGreeting() {
    if (!ctx) return;
    try {
      const { agentRow, bizRow, callRow, contactRow } = ctx;
      const callerName = callRow.callerName ?? contactRow?.name ?? null;
      const bizName = bizRow?.name ?? '';
      const agentName = agentRow?.name ?? '';

      let greeting: string;
      if (agentRow?.greeting?.trim()) {
        // Use the exact greeting script the user configured in the dashboard
        greeting = agentRow.greeting.trim();
        // Simple substitution for placeholders if any
        if (callerName) greeting = greeting.replace(/\{name\}/gi, callerName);
        greeting = greeting.replace(/\{business\}/gi, bizName).replace(/\{agent\}/gi, agentName);
      } else if (callerName) {
        greeting = `Welcome back, ${callerName}! How can I help you today?`;
      } else {
        greeting = `Hello! Thank you for calling ${bizName || 'us'}. How can I help you today?`;
      }

      // Pre-load into conversation history so LLM has context of what was said
      conversationHistory.push({ role: 'assistant', content: greeting });

      await db.insert(transcripts).values({ callId, speaker: 'agent', text: greeting }).catch(() => null);
      await streamTTS(greeting);
    } catch (err) {
      logger.error({ err, callId }, 'Failed to send greeting');
    }
  }

  // ── Twilio WebSocket event handlers ──────────────────────────────────────

  ws.on('message', async (data: Buffer) => {
    let msg: any;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg.event) {
      case 'start': {
        streamSid = msg.start.streamSid ?? '';
        callSid = msg.start.callSid ?? '';
        callId = msg.start.customParameters?.callId ?? '';

        logger.info({ streamSid, callSid, callId }, 'Twilio Media Stream started');

        if (!callId) { logger.error('Stream missing callId'); ws.close(); return; }

        loadCallContext(callId)
          .then(loaded => {
            if (!loaded) { logger.error({ callId }, 'Call not found in DB'); ws.close(); return; }
            ctx = loaded;

            agentVoiceId = loaded.agentRow?.voiceId;
            agentClonedVoiceId = loaded.agentRow?.clonedVoiceId;
            ops = loaded.bizRow ? opsEnabled(loaded.bizRow) : true;
            canEscalate = !!loaded.kbRow?.escalationNumber;
            systemInstructions = buildInstructions(loaded);

            if (!env.DEEPGRAM_API_KEY) {
              logger.error({ callId }, 'No DEEPGRAM_API_KEY — redirecting to fallback greeting path');
              fallbackToGatherPath();
              return;
            }

            logger.info({ callId, agentVoiceId, ops, canEscalate }, 'Call context loaded — connecting to Deepgram');
            connectToDeepgram();
            sendGreeting().catch(err => logger.error({ err, callId }, 'Greeting error'));
          })
          .catch(err => {
            logger.error({ err, callId }, 'Failed to load call context');
            fallbackToGatherPath();
          });
        break;
      }

      case 'media': {
        const payload: string = msg.media?.payload ?? '';
        if (!payload) break;
        const chunk = Buffer.from(payload, 'base64');
        if (!dgReady) {
          audioQueue.push(chunk);
        } else {
          const ab = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
          dgConnection?.send(ab);
        }
        break;
      }

      case 'stop': {
        logger.info({ streamSid, callId }, 'Twilio stream stopped');
        dgConnection?.finish();
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
    dgConnection?.finish();
    logger.info({ streamSid, callId }, 'Twilio WebSocket closed');
  });

  ws.on('error', err => {
    logger.error({ err, streamSid }, 'Twilio WebSocket error');
    dgConnection?.finish();
  });
}
