import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@milu/db';
import { signToken, verifyToken } from '../utils/jwt';
import { authLimiter } from '../middleware/rate-limit';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, businessName } = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const business = await prisma.business.create({
      data: {
        name: businessName,
        users: { create: { email, password: hashed, role: 'OWNER' } },
        knowledgeBase: {
          create: {
            businessName,
            operatingHours: {},
            faqs: [],
          },
        },
      },
      include: { users: true },
    });

    const user = business.users[0];
    const token = signToken({ userId: user.id, businessId: business.id, role: 'OWNER' });
    return res.status(201).json({ token, businessId: business.id });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({
      userId: user.id,
      businessId: user.businessId ?? undefined,
      role: user.role,
    });
    return res.json({ token });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
    const payload = verifyToken(header.slice(7));
    const token = signToken({ userId: payload.userId, businessId: payload.businessId, role: payload.role });
    return res.json({ token });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.json({ success: true });
});
