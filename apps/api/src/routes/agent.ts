import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, agentConfigs } from '../db';
import { authMiddleware } from '../middleware/auth';
import { audit } from '../services/audit';
import { env } from '../config/env';
import { logger } from '../config/logger';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const agentRouter: Router = Router();
agentRouter.use(authMiddleware);

/**
 * @openapi
 * tags:
 *   - name: Agent
 *     description: AI agent configuration per business
 */

/**
 * @openapi
 * /api/v1/agent/{businessId}:
 *   get:
 *     tags: [Agent]
 *     summary: Get agent configuration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Agent config
 */
agentRouter.get('/:businessId', async (req, res, next) => {
  try {
    const [config] = await db.select().from(agentConfigs).where(eq(agentConfigs.businessId, req.params.businessId)).limit(1);
    if (!config) {
      // Return defaults if not configured yet
      return res.json({
        businessId: req.params.businessId,
        name: 'Milu',
        language: 'en',
        tone: 'friendly',
        greeting: null,
        fallbackMessage: null,
        maxCallDuration: 600,
        enableRecording: true,
        enableTranscription: true,
        voiceId: null,
        businessHoursOnly: false,
        afterHoursMessage: null,
      });
    }
    return res.json(config);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /api/v1/agent/{businessId}:
 *   put:
 *     tags: [Agent]
 *     summary: Create or update agent configuration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, description: "Agent display name" }
 *               language: { type: string, example: "en", description: "en, yo (Yoruba), ig (Igbo), ha (Hausa), pcm (Pidgin)" }
 *               tone: { type: string, enum: [friendly, formal, professional, casual] }
 *               greeting: { type: string, description: "Custom greeting script" }
 *               fallbackMessage: { type: string, description: "Message when agent can't help" }
 *               maxCallDuration: { type: integer, description: "Max call length in seconds" }
 *               enableRecording: { type: boolean }
 *               enableTranscription: { type: boolean }
 *               voiceId: { type: string, description: "ElevenLabs voice ID" }
 *               businessHoursOnly: { type: boolean, description: "Reject calls outside business hours" }
 *               afterHoursMessage: { type: string, description: "Message played outside hours" }
 *     responses:
 *       200:
 *         description: Saved agent config
 */
agentRouter.put('/:businessId', async (req, res, next) => {
  try {
    const data = z.object({
      name: z.string().min(1).optional(),
      language: z.string().optional(),
      tone: z.string().optional(),
      greeting: z.string().optional().nullable(),
      fallbackMessage: z.string().optional().nullable(),
      maxCallDuration: z.number().int().min(30).max(3600).optional(),
      enableRecording: z.boolean().optional(),
      enableTranscription: z.boolean().optional(),
      voiceId: z.string().optional().nullable(),
      businessHoursOnly: z.boolean().optional(),
      afterHoursMessage: z.string().optional().nullable(),
    }).parse(req.body);

    const existing = await db.select({ id: agentConfigs.id }).from(agentConfigs)
      .where(eq(agentConfigs.businessId, req.params.businessId)).limit(1);

    let config;
    if (existing.length) {
      [config] = await db.update(agentConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(agentConfigs.businessId, req.params.businessId))
        .returning();
    } else {
      [config] = await db.insert(agentConfigs)
        .values({ businessId: req.params.businessId, ...data })
        .returning();
    }

    await audit(req, 'agent.updated', 'agent_config', config.id);
    return res.json(config);
  } catch (err) { next(err); }
});

// POST /agent/:businessId/voice-clone — upload audio to create ElevenLabs custom voice
agentRouter.post('/:businessId/voice-clone', upload.array('files', 5), async (req, res, next) => {
  try {
    if (!env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ElevenLabs not configured' });

    const files = req.files as Express.Multer.File[];
    if (!files?.length) return res.status(400).json({ error: 'At least one audio file required' });

    const { name } = z.object({ name: z.string().min(1).default('My Voice') }).parse(req.body);

    const form = new FormData();
    form.append('name', name);
    form.append('description', `Voice clone for business ${req.params.businessId}`);
    for (const file of files) {
      form.append('files', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
    }

    const elRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
      body: form,
    });

    if (!elRes.ok) {
      const err = await elRes.text();
      throw new Error(`ElevenLabs error ${elRes.status}: ${err}`);
    }

    const { voice_id } = await elRes.json() as { voice_id: string };

    // Save cloned voice ID to agent config
    const existing = await db.select({ id: agentConfigs.id }).from(agentConfigs)
      .where(eq(agentConfigs.businessId, req.params.businessId)).limit(1);

    let config;
    if (existing.length) {
      [config] = await db.update(agentConfigs)
        .set({ clonedVoiceId: voice_id, clonedVoiceName: name, voiceId: voice_id, updatedAt: new Date() })
        .where(eq(agentConfigs.businessId, req.params.businessId))
        .returning();
    } else {
      [config] = await db.insert(agentConfigs)
        .values({ businessId: req.params.businessId, clonedVoiceId: voice_id, clonedVoiceName: name, voiceId: voice_id })
        .returning();
    }

    logger.info({ businessId: req.params.businessId, voice_id, name }, 'Voice clone created');
    await audit(req, 'agent.voice_cloned', 'agent_config', config.id, { voice_id, name });
    return res.json({ voiceId: voice_id, name });
  } catch (err) { next(err); }
});

// DELETE /agent/:businessId/voice-clone — remove custom voice
agentRouter.delete('/:businessId/voice-clone', async (req, res, next) => {
  try {
    const [config] = await db.select({ clonedVoiceId: agentConfigs.clonedVoiceId })
      .from(agentConfigs).where(eq(agentConfigs.businessId, req.params.businessId)).limit(1);

    if (config?.clonedVoiceId && env.ELEVENLABS_API_KEY) {
      await fetch(`https://api.elevenlabs.io/v1/voices/${config.clonedVoiceId}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
      }).catch(() => null);
    }

    await db.update(agentConfigs)
      .set({ clonedVoiceId: null, clonedVoiceName: null, voiceId: 'amaka', updatedAt: new Date() })
      .where(eq(agentConfigs.businessId, req.params.businessId));

    return res.json({ message: 'Voice clone removed' });
  } catch (err) { next(err); }
});
