import { redis } from '../utils/redis';

const SESSION_TTL = 3600;

export interface CallSession {
  callId: string;
  businessId: string;
  callerNumber: string;
  startedAt: string;
}

export async function createSession(session: CallSession): Promise<void> {
  await redis?.set(`call:session:${session.callId}`, JSON.stringify(session), 'EX', SESSION_TTL);
}

export async function getSession(callId: string): Promise<CallSession | null> {
  const raw = await redis?.get(`call:session:${callId}`);
  if (!raw) return null;
  return JSON.parse(raw) as CallSession;
}

export async function deleteSession(callId: string): Promise<void> {
  await redis?.del(`call:session:${callId}`);
}
