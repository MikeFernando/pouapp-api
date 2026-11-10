import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { store } from '../services/store.js';

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).optional(),
});

authRouter.post('/auth/register', async (req, res, next) => {
  try {
    const body = credentialsSchema.parse(req.body);
    if (store.findUserByEmail(body.email)) {
      throw new HttpError(409, 'E-mail já cadastrado.');
    }

    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      name: body.name?.trim() || body.email.split('@')[0],
      email: body.email.toLowerCase(),
      passwordHash: await bcrypt.hash(body.password, 10),
      createdAt: now,
      updatedAt: now,
    };
    store.users.set(user.id, user);
    store.profiles.set(user.id, {
      userId: user.id,
      receiverName: user.name,
      updatedAt: now,
    });

    const token = signToken(user.id, user.email);
    res.status(201).json({
      token,
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const body = credentialsSchema.omit({ name: true }).parse(req.body);
    const user = store.findUserByEmail(body.email);
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, 'E-mail ou senha inválidos.');
    }

    res.json({
      token: signToken(user.id, user.email),
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/auth/me', requireAuth, (req: AuthedRequest, res, next) => {
  try {
    const user = store.users.get(req.user!.sub);
    if (!user) throw new HttpError(404, 'Usuário não encontrado.');
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

function signToken(sub: string, email: string) {
  return jwt.sign({ sub, email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

function publicUser(user: { id: string; name: string; email: string }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
