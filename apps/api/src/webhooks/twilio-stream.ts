import type { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { and, desc, eq, ne } from 'drizzle-orm';
import {
  db, calls, contacts, agentConfigs, businesses, knowledgeBases,
  knowledgeDocuments, transcripts, appointments, orders, escalations,
  catalogItems, businessSettings, campaignContacts, campaigns,
} from '../db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getElevenLabsVoiceId, ELEVENLABS_VOICES, DEFAULT_VOICE } from '../config/voices';
import { notifyBusinessOwners } from '../services/notifications';
import { sendEscalationAlert, sendWhatsAppNotification } from '../services/whatsapp';
import { HumeStream } from '../services/hume';
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
  campaignGoal: string | null;
  campaignScript: string | null;
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

  // Load campaign context for outbound calls
  let campaignGoal: string | null = null;
  let campaignScript: string | null = null;
  if (callRow.direction === 'OUTBOUND' && callRow.campaignContactId) {
    const [cc] = await db.select({ campaignId: campaignContacts.campaignId })
      .from(campaignContacts).where(eq(campaignContacts.id, callRow.campaignContactId)).limit(1);
    if (cc) {
      const [camp] = await db.select({ goal: campaigns.goal, script: campaigns.script })
        .from(campaigns).where(eq(campaigns.id, cc.campaignId)).limit(1);
      campaignGoal = camp?.goal ?? null;
      campaignScript = camp?.script ?? null;
    }
  }

  return { callRow, agentRow, bizRow, kbRow, kbDocs, contactRow, previousSnippets, catalogSummary, campaignGoal, campaignScript };
}

// ─── System instructions ──────────────────────────────────────────────────────

function buildInstructions(ctx: CallContext, ops: boolean): string {
  const { callRow, agentRow, bizRow, kbRow, kbDocs, contactRow, previousSnippets, catalogSummary, campaignGoal, campaignScript } = ctx;
  const isOutbound = callRow.direction === 'OUTBOUND';
  const callerName = callRow.callerName ?? contactRow?.name ?? null;
  const callerLocation = callRow.callerLocation ?? contactRow?.location ?? null;
  const agentName = agentRow?.name ?? 'your agent';
  const bizName = bizRow?.name ?? 'this business';
  const tone = agentRow?.tone ?? 'friendly and professional';
  const faqs: { question: string; answer: string }[] = (kbRow?.faqs as any) ?? [];

  return [
    isOutbound
      ? `You are ${agentName}, a phone sales and follow-up agent for "${bizName}". Your name is ${agentName} — never call yourself "Milu" or any other name.`
      : `You are ${agentName}, a phone customer service agent for "${bizName}". Your name is ${agentName} — never call yourself "Milu" or any other name.`,
    `Tone: ${tone}. Speak naturally as on a real phone call — concise, 1 to 3 short sentences max per turn.`,
    `Never use bullet points, numbered lists, or markdown. Never start with filler words like "Alright", "Sure", "Okay", "Certainly".`,
    `Start directly with your answer or question.`,
    isOutbound ? `You are making an OUTBOUND call. You called the customer, not the other way around. Open with a brief friendly introduction and state the purpose of your call.` : null,
    isOutbound && campaignGoal ? `CALL PURPOSE: ${campaignGoal}` : null,
    isOutbound && campaignScript ? `OPENING SCRIPT HINT: ${campaignScript}` : null,
    callerName ? `Contact name: ${callerName}.` : null,
    callerLocation ? `Location: ${callerLocation}.` : null,
    callRow.callerNumber ? `Phone: ${callRow.callerNumber}.` : null,
    previousSnippets.length
      ? `Previous conversations with this contact (most recent last):\n${previousSnippets.join('\n')}`
      : null,
    `Do NOT ask for the caller's name or location at the start of the call. Only ask once the conversation is naturally wrapping up — before ending, say something like "Before I let you go, may I get your name and location so we can follow up if needed?" Then use their name going forward.`,
    `If the customer seems frustrated or upset, acknowledge their feelings first before answering.`,
    `Never reveal you are an AI unless directly asked.`,
    `Respond in the same language or dialect the customer uses — English, Arabic, Nigerian Pidgin, Yoruba, Igbo, Hausa. If the caller speaks Arabic, respond fully in Arabic. Match their style naturally.`,
    bizRow && kbRow?.websiteSummary ? `About ${bizName}: ${kbRow.websiteSummary.slice(0, 600)}` : null,
    faqs.length ? `Common questions:\n${faqs.slice(0, 10).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n')}` : null,
    kbDocs.length ? `Additional info: ${kbDocs.slice(0, 3).map(d => (d.summary ?? '').slice(0, 300)).join(' ')}` : null,
    catalogSummary
      ? `Products & services catalog (source of truth):\n${catalogSummary}\nOnly mention items and prices that appear in the catalog above.`
      : null,
    ``,
    ops ? `APPOINTMENTS: When the customer wants to book an appointment, collect the date, time, service type, and name. Then call the create_appointment function. After booking, confirm with the customer and ask if there is anything else you can help with — do NOT end the call immediately.` : null,
    ops ? `ORDERS: When the customer wants to place an order, collect all items, quantities, delivery address, and their name. Then call the create_order function. After the order is placed, confirm the details and ask if there is anything else — do NOT end the call immediately.` : null,
    kbRow?.escalationNumber
      ? `ESCALATION: If you cannot help, the customer requests a human agent, or the caller expresses any urgent, emergency, or time-sensitive need (e.g. medical emergency, safety issue, extreme frustration), call the escalate_to_human function immediately — do NOT ask clarifying questions when the need is urgent.`
      : `If you cannot help, let the customer know the team will follow up.`,
    `CALLER NAME: If you mispronounce the caller's name and they correct you, or if they give you their name for the first time, immediately call update_caller_name with the correct name and then use it from that point on.`,
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
      name: 'update_caller_name',
      description: 'Update the caller\'s name when they correct you or provide their name for the first time.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'The correct name as the caller stated it' } },
        required: ['name'],
      },
    },
  });

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

// ─── Post-call owner WhatsApp notification ────────────────────────────────────

async function sendPostCallWhatsApp(businessId: string, callerNumber: string | null, resolution: string) {
  try {
    const [settings] = await db.select({ whatsappNumber: businessSettings.whatsappNumber, whatsappVerified: businessSettings.whatsappVerified })
      .from(businessSettings).where(eq(businessSettings.businessId, businessId)).limit(1);
    if (!settings?.whatsappNumber) return;
    const caller = callerNumber ?? 'Unknown';
    const body = `A call from ${caller} has ended (handled by AI). Review it in your Milu dashboard.`;
    await sendWhatsAppNotification(settings.whatsappNumber, 'Call Ended', body);
  } catch { /* ignore */ }
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
  // Greeting guard: queue caller speech until greeting finishes to prevent LLM firing mid-greeting
  let greetingInProgress = false;
  let queuedCallerSpeech: string | null = null;
  // LLM serialisation: prevent concurrent LLM+TTS calls from aborting each other
  let llmRunning = false;
  let pendingCallerSpeech: string | null = null;

  // Hume emotion detection
  let humeStream: HumeStream | null = null;
  let currentEmotionNote = '';        // injected into LLM system prompt when caller shows strong emotion
  let pendingTextTranscriptId: string | undefined; // last caller transcript awaiting Hume text emotion

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
      logger.info({ callId, args }, 'create_appointment called');
      if (Number.isNaN(scheduledAt.getTime())) {
        logger.warn({ callId, scheduledAt: args.scheduledAt }, 'create_appointment — invalid date');
        return JSON.stringify({ success: false, error: 'Invalid date/time' });
      }

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
      logger.info({ callId, args }, 'create_order called');
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

    if (name === 'update_caller_name') {
      const newName = (args.name ?? '').trim();
      if (!newName) return JSON.stringify({ success: false, error: 'Name is empty' });

      // Update the calls row so post-call records reflect the corrected name
      await db.update(calls).set({ callerName: newName }).where(eq(calls.id, callId)).catch(() => null);

      // Also update the linked contact if one exists
      if (callRow.contactId) {
        await db.update(contacts).set({ name: newName, updatedAt: new Date() })
          .where(eq(contacts.id, callRow.contactId)).catch(() => null);
      }

      // Patch the live system instructions so subsequent LLM turns use the correct name
      systemInstructions = systemInstructions.replace(
        /Caller's name: .+?\./,
        `Caller's name: ${newName}.`,
      );
      if (!systemInstructions.includes(`Caller's name:`)) {
        systemInstructions = `Caller's name: ${newName}.\n` + systemInstructions;
      }

      logger.info({ callId, newName }, 'Caller name updated');
      return JSON.stringify({ success: true });
    }

    if (name === 'end_call') {
      await streamTTS('Enjoy the rest of your day and thank you for calling.');
      await db.update(calls).set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() })
        .where(eq(calls.id, callId)).catch(() => null);
      sendPostCallWhatsApp(callRow.businessId, callRow.callerNumber, 'AI').catch(() => null);
      hangUp(1500).catch(() => null);
      return JSON.stringify({ success: true });
    }

    return JSON.stringify({ success: false, error: 'Unknown function' });
  }

  // ── LLM + ElevenLabs WebSocket streaming ─────────────────────────────────
  // Tokens from OpenAI are piped directly to ElevenLabs in real-time,
  // eliminating the sentence-boundary wait of the old REST-per-sentence approach.

  let callEnded = false;

  async function streamLLMAndTTS(userText: string): Promise<string> {
    if (!env.OPENAI_API_KEY || callEnded) return '';

    logger.info({ callId, textLen: userText.length }, 'LLM call start');
    conversationHistory.push({ role: 'user', content: userText });
    const tools = buildChatTools(ops, canEscalate);

    for (let iteration = 0; iteration < 5; iteration++) {
      if (callEnded) return '';

      // Start OpenAI and open ElevenLabs WS concurrently to minimise latency
      const voiceId = resolveElevenLabsVoiceId(agentVoiceId, agentClonedVoiceId);
      const elWsUrl =
        `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input` +
        `?model_id=eleven_flash_v2_5&output_format=ulaw_8000&optimize_streaming_latency=4`;

      if (ttsAbortController) ttsAbortController.abort();
      ttsAbortController = new AbortController();
      const myAbort = ttsAbortController;

      // ── Open ElevenLabs WebSocket ──
      // Use object so TypeScript doesn't narrow the value aggressively inside closures
      const elState = { v: 'connecting' as 'connecting' | 'open' | 'closed' };
      let elTextSent = false;
      let elAudioFinished = false;
      let elDoneResolve!: () => void;
      const elAudioDone = new Promise<void>(r => { elDoneResolve = r; });
      const pendingText: string[] = []; // buffer tokens until WS opens

      let elWs: InstanceType<typeof WebSocket> | null = null;

      if (env.ELEVENLABS_API_KEY && !myAbort.signal.aborted) {
        elWs = new WebSocket(elWsUrl, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } });

        elWs.on('open', () => {
          elState.v = 'open';
          if (myAbort.signal.aborted) { elWs!.close(); return; }
          logger.info({ callId, voiceId }, 'ElevenLabs WS open — streaming LLM tokens');
          elWs!.send(JSON.stringify({
            text: ' ',
            voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
            // Low threshold so audio starts on the first ~10 words, not after 120 chars
            generation_config: { chunk_length_schedule: [50] },
          }));
          // Flush any tokens that arrived before WS opened
          for (const t of pendingText) {
            elWs!.send(JSON.stringify({ text: t, try_trigger_generation: true }));
            elTextSent = true;
          }
          pendingText.length = 0;
        });

        elWs.on('message', (data: Buffer) => {
          if (myAbort.signal.aborted) { elWs!.close(); return; }
          try {
            const msg = JSON.parse(data.toString());
            if (msg.audio) {
              // Mark as speaking only once audio actually arrives — prevents false
              // barge-in abort during the OpenAI "thinking" phase
              agentSpeaking = true;
              sendAudio(msg.audio);
            }
            if (msg.isFinal) { elAudioFinished = true; elDoneResolve(); }
          } catch { /* ignore */ }
        });

        elWs.on('error', (err: Error) => {
          logger.warn({ err: err.message, callId }, 'ElevenLabs WS error');
          elState.v = 'closed';
          elDoneResolve();
        });

        elWs.on('close', () => {
          elState.v = 'closed';
          if (!elAudioFinished) elDoneResolve();
        });

        // Do NOT set agentSpeaking=true here — wait for actual audio to arrive
      } else {
        elDoneResolve(); // nothing to wait for
      }

      // ── OpenAI streaming ──
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: currentEmotionNote + systemInstructions }, ...conversationHistory],
          tools,
          tool_choice: 'auto',
          temperature: 0.4,
          max_tokens: 120,
          stream: true,
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => '');
        logger.warn({ status: res.status, err: err.slice(0, 200) }, 'OpenAI stream error');
        elWs?.close();
        agentSpeaking = false;
        const sorry = "Sorry, could you repeat that? I didn't quite catch it.";
        await streamTTS(sorry);
        return sorry;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      type TcAccum = { id: string; name: string; args: string };
      const tcMap = new Map<number, TcAccum>();
      let fullText = '';
      let finishReason = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || myAbort.signal.aborted) break;
          for (const line of dec.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') break;
            let chunk: any;
            try { chunk = JSON.parse(raw); } catch { continue; }
            const choice = chunk.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;
            const delta = choice.delta ?? {};

            // Stream text token → ElevenLabs WS in real-time
            if (delta.content && !myAbort.signal.aborted) {
              fullText += delta.content;
              if (elWs) {
                if (elState.v === 'open') {
                  elWs.send(JSON.stringify({ text: delta.content, try_trigger_generation: true }));
                  elTextSent = true;
                } else if (elState.v === 'connecting') {
                  pendingText.push(delta.content);
                }
              }
            }

            // Accumulate tool calls
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls as any[]) {
                if (!tcMap.has(tc.index)) tcMap.set(tc.index, { id: '', name: '', args: '' });
                const acc = tcMap.get(tc.index)!;
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) acc.args += tc.function.arguments;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // If WS was still connecting when OpenAI finished, wait briefly then flush buffer
      if (elWs && elState.v === 'connecting' && pendingText.length > 0) {
        await Promise.race([
          new Promise<void>(r => elWs!.once('open', r)),
          new Promise<void>(r => elWs!.once('error', r as any)),
          new Promise<void>(r => setTimeout(r, 2000)),
        ]);
        if (elWs.readyState === WebSocket.OPEN && pendingText.length > 0) {
          for (const t of pendingText) {
            elWs.send(JSON.stringify({ text: t }));
            elTextSent = true;
          }
          pendingText.length = 0;
        }
      }

      // Send EOS and wait for all audio chunks
      if (elWs && elTextSent && elWs.readyState === WebSocket.OPEN && !myAbort.signal.aborted) {
        elWs.send(JSON.stringify({ text: '' })); // EOS
        await Promise.race([elAudioDone, new Promise<void>(r => setTimeout(r, 10000))]);
      } else {
        elDoneResolve(); // nothing was sent — don't wait
      }
      if (elWs && elState.v !== 'closed') elWs.close();
      agentSpeaking = false;

      // ElevenLabs WS closed/failed before audio played — fall back to HTTP TTS so caller hears something
      if (!elAudioFinished && fullText.trim() && finishReason !== 'tool_calls' && !myAbort.signal.aborted) {
        logger.warn({ callId, elTextSent }, 'ElevenLabs WS audio incomplete — falling back to HTTP TTS');
        await streamTTS(fullText);
      }

      if (finishReason === 'tool_calls' && tcMap.size > 0) {
        const tcs = Array.from(tcMap.values());
        conversationHistory.push({
          role: 'assistant',
          content: fullText || null,
          tool_calls: tcs.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args } })),
        } as any);

        for (const tc of tcs) {
          let fnArgs: Record<string, any> = {};
          try { fnArgs = JSON.parse(tc.args || '{}'); } catch { /* ignore */ }
          logger.info({ callId, fnName: tc.name }, 'Function call');
          const result = await executeFn(tc.name, fnArgs).catch(err => {
            logger.error({ err, fnName: tc.name }, 'Function execution error');
            return JSON.stringify({ success: false });
          });
          conversationHistory.push({ role: 'tool', tool_call_id: tc.id, content: result } as any);
          if (tc.name === 'end_call' || tc.name === 'escalate_to_human') {
            callEnded = true;
            return '';
          }
        }
        continue; // Get the text reply after tool execution
      }

      const reply = fullText.trim();
      if (reply) conversationHistory.push({ role: 'assistant', content: reply });
      return reply;
    }

    return '';
  }

  // ── Stream TTS → Twilio (ElevenLabs primary, OpenAI fallback) ───────────────

  async function streamElevenLabsTTS(text: string, abort: AbortController): Promise<boolean> {
    if (!env.ELEVENLABS_API_KEY) return false;

    const voiceId = resolveElevenLabsVoiceId(agentVoiceId, agentClonedVoiceId);
    logger.info({ callId, voiceId, textLen: text.length }, 'Streaming ElevenLabs TTS');

    let res: Response;
    try {
      res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=ulaw_8000`,
        {
          method: 'POST',
          headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: 'eleven_flash_v2_5',
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
      logger.warn({ status: res.status, err: err.slice(0, 300), voiceId }, 'ElevenLabs TTS failed');
      return false;
    }

    logger.info({ callId, voiceId, textLen: text.length }, 'ElevenLabs TTS streaming to Twilio');
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

  async function streamTTS(text: string, onFail?: () => void): Promise<void> {
    if (!text.trim()) { onFail?.(); return; }
    if (ws.readyState !== WebSocket.OPEN) { onFail?.(); return; }

    if (ttsAbortController) ttsAbortController.abort();
    ttsAbortController = new AbortController();
    agentSpeaking = true;

    try {
      const ok = await streamElevenLabsTTS(text, ttsAbortController);
      if (!ok) {
        logger.error({ callId }, 'ElevenLabs TTS failed — no audio sent');
        if (onFail) {
          onFail();
        } else {
          // No fallback provided — keep the call alive by saying sorry via Twilio REST
          const client = getTwilioClient();
          if (client && callSid) {
            const sorry = encodeURIComponent("Sorry, I couldn't hear you clearly. Could you say that again?");
            client.calls(callSid)
              .update({ twiml: `<Response><Say voice="alice">${decodeURIComponent(sorry)}</Say></Response>` })
              .catch(() => null);
          }
        }
      }
    } finally {
      agentSpeaking = false;
    }
  }

  // ── Handle a final transcript from Deepgram ────────────────────────────────

  // Urgency keywords that should trigger immediate escalation before the LLM responds
  const URGENT_PATTERN = /\b(emergency|ambulance|fire brigade|fire service|police|dying|can'?t breathe|heart attack|stroke|life threatening|life-threatening|armed robbery|kidnap|bleeding badly|someone broke in)\b/i;

  async function handleCallerSpeech(text: string) {
    if (!ctx) return;

    // Immediate escalation for genuine emergencies — don't wait for the LLM
    if (canEscalate && URGENT_PATTERN.test(text)) {
      logger.info({ callId, text: text.slice(0, 100) }, 'Urgent keyword detected — escalating immediately');
      await streamTTS('I understand this is urgent. I am connecting you to someone right away.').catch(() => null);
      await executeFn('escalate_to_human', { reason: `Caller said: "${text.slice(0, 200)}"` }).catch(() => null);
      return;
    }

    // Serialise LLM calls: if one is already running, queue the latest speech
    if (llmRunning) {
      pendingCallerSpeech = text;
      logger.info({ callId, text: text.slice(0, 80) }, 'LLM busy — caller speech queued');
      return;
    }

    llmRunning = true;
    logger.info({ callId, text: text.slice(0, 200) }, 'Caller speech final');

    // Insert transcript and (fire-and-forget) update it with Hume text emotion
    const transcriptId = await db.insert(transcripts)
      .values({ callId, speaker: 'caller', text })
      .returning({ id: transcripts.id })
      .then(r => r[0]?.id)
      .catch(() => undefined);

    if (transcriptId && humeStream) {
      humeStream.sendText(text); // Hume callback will update this row when result arrives
      // Store the pending transcript ID so the callback can update it
      pendingTextTranscriptId = transcriptId;
    }

    try {
      const reply = await streamLLMAndTTS(text);
      if (reply) await db.insert(transcripts).values({ callId, speaker: 'agent', text: reply }).catch(() => null);
    } catch (err) {
      logger.error({ err, callId }, 'Error handling caller speech');
    } finally {
      llmRunning = false;
      if (pendingCallerSpeech) {
        const pending = pendingCallerSpeech;
        pendingCallerSpeech = null;
        handleCallerSpeech(pending).catch(err =>
          logger.error({ err, callId }, 'handleCallerSpeech (pending) error'),
        );
      }
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

    // Use the agent's configured language for fast fixed-language STT
    // detect_language adds significant latency — only use per-language models
    const agentLang = ctx?.agentRow?.language ?? 'en';
    const dgLanguage = agentLang === 'ar' ? 'ar' : 'en';

    const conn = dgClient.listen.live({
      model: 'nova-2',
      language: dgLanguage,
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
      // Don't interrupt during the greeting — let it play fully
      if (text && agentSpeaking && !greetingInProgress) {
        ttsAbortController?.abort();
        clearAudio();
        agentSpeaking = false;
      }

      if (isFinal && speechFinal) {
        logger.info({ callId, text: text.slice(0, 200), len: text.trim().length }, 'Deepgram speech_final');
      }
      // Require at least 2 chars — filters out single-char noise detections
      if (isFinal && speechFinal && text.trim().length >= 2) {
        const trimmed = text.trim();
        if (greetingInProgress) {
          // Greeting is still playing — queue the speech, don't fire LLM yet
          queuedCallerSpeech = trimmed;
        } else {
          handleCallerSpeech(trimmed).catch(err =>
            logger.error({ err, callId }, 'handleCallerSpeech error'),
          );
        }
      }
    });

    let dgRetried = false;
    conn.on(LiveTranscriptionEvents.Error, (err: any) => {
      logger.error({ err, callId }, 'Deepgram STT error');
      if (!dgRetried) {
        dgRetried = true;
        logger.info({ callId }, 'Deepgram error — retrying connection once');
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) connectToDeepgram();
          else fallbackToGatherPath();
        }, 1500);
      } else {
        fallbackToGatherPath();
      }
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
      const { agentRow, bizRow, callRow, contactRow, campaignGoal } = ctx;
      const callerName = callRow.callerName ?? contactRow?.name ?? null;
      const bizName = bizRow?.name ?? '';
      const agentName = agentRow?.name ?? '';
      const isOutbound = callRow.direction === 'OUTBOUND';

      const isReturning = ctx.previousSnippets.length > 0;

      let greeting: string;
      if (isOutbound) {
        const nameGreet = callerName ? `Hi ${callerName}, ` : 'Hello, ';
        greeting = `${nameGreet}this is ${agentName || 'an assistant'} from ${bizName || 'us'}. I hope I'm not catching you at a bad time. ${campaignGoal ? `I'm calling regarding ${campaignGoal}.` : 'I just wanted to follow up with you.'} Do you have a moment to chat?`;
      } else if (agentRow?.greeting?.trim()) {
        greeting = agentRow.greeting.trim();
        if (callerName) greeting = greeting.replace(/\{name\}/gi, callerName);
        greeting = greeting.replace(/\{business\}/gi, bizName).replace(/\{agent\}/gi, agentName);
      } else if (isReturning) {
        greeting = 'Welcome back! How may I help you today?';
      } else {
        greeting = `Hello! Thank you for calling ${bizName || 'us'}. How can I help you today?`;
      }

      // Pre-load into conversation history so LLM has context of what was said
      conversationHistory.push({ role: 'assistant', content: greeting });

      await db.insert(transcripts).values({ callId, speaker: 'agent', text: greeting }).catch(() => null);
      greetingInProgress = true;
      await streamTTS(greeting, () => {
        logger.warn({ callId }, 'Greeting TTS failed — redirecting to gather path');
        greetingInProgress = false;
        fallbackToGatherPath();
      });
      greetingInProgress = false;
      // Process any caller speech that arrived while greeting was playing
      if (queuedCallerSpeech) {
        const queued = queuedCallerSpeech;
        queuedCallerSpeech = null;
        handleCallerSpeech(queued).catch(err => logger.error({ err, callId }, 'handleCallerSpeech (queued) error'));
      }
    } catch (err) {
      logger.error({ err, callId }, 'Failed to send greeting — redirecting to gather path');
      fallbackToGatherPath();
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
            systemInstructions = buildInstructions(loaded, ops);

            if (!env.DEEPGRAM_API_KEY) {
              logger.error({ callId }, 'No DEEPGRAM_API_KEY — redirecting to fallback greeting path');
              fallbackToGatherPath();
              return;
            }

            logger.info({ callId, agentVoiceId, ops, canEscalate, tier: loaded.bizRow?.subscriptionTier }, 'Call context loaded — connecting to Deepgram');
            connectToDeepgram();

            // Start Hume emotion detection for this call
            if (env.HUME_API_KEY) {
              humeStream = new HumeStream(env.HUME_API_KEY, (emotions, source) => {
                const top = emotions[0];
                if (!top) return;
                logger.info({ callId, emotion: top.name, score: +(top.score.toFixed(3)), source }, 'Hume emotion');

                // Update the call's top emotion
                db.update(calls).set({ topEmotion: top.name }).where(eq(calls.id, callId)).catch(() => null);

                // For language (text) emotions, update the pending transcript row
                if (source === 'language' && pendingTextTranscriptId) {
                  const tid = pendingTextTranscriptId;
                  pendingTextTranscriptId = undefined;
                  db.update(transcripts)
                    .set({ emotion: top.name, emotionScore: top.score })
                    .where(eq(transcripts.id, tid))
                    .catch(() => null);
                }

                // Inject emotion context into LLM when caller shows strong negative emotion
                const negative = ['Anger', 'Anxiety', 'Distress', 'Fear', 'Frustration', 'Confusion', 'Contempt'];
                if (negative.includes(top.name) && top.score > 0.3) {
                  currentEmotionNote = `[Caller emotional state: ${top.name} — be extra empathetic, patient and helpful]\n`;
                } else if (top.score > 0.5) {
                  currentEmotionNote = ''; // positive/neutral — clear the note
                }
              });
            }

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
        // Forward raw audio to Hume for voice emotion (prosody) analysis
        humeStream?.sendAudio(chunk);
        break;
      }

      case 'stop': {
        logger.info({ streamSid, callId }, 'Twilio stream stopped');
        dgConnection?.finish();
        humeStream?.close();
        humeStream = null;
        if (callId) {
          const [updatedCall] = await db.update(calls)
            .set({ status: 'COMPLETED', resolution: 'AI', endedAt: new Date() })
            .where(and(eq(calls.id, callId), eq(calls.status, 'ACTIVE')))
            .returning({ businessId: calls.businessId, callerNumber: calls.callerNumber })
            .catch(() => []);
          if (updatedCall) {
            sendPostCallWhatsApp(updatedCall.businessId, updatedCall.callerNumber, 'AI').catch(() => null);
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    dgConnection?.finish();
    humeStream?.close();
    logger.info({ streamSid, callId }, 'Twilio WebSocket closed');
  });

  ws.on('error', err => {
    logger.error({ err, streamSid }, 'Twilio WebSocket error');
    dgConnection?.finish();
    humeStream?.close();
  });
}
