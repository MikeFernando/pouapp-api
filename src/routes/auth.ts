import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../middleware/error.js';
import { clientIp, requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { authRateLimit, refreshRateLimit } from '../middleware/rate-limit.js';
import {
  issueTokenPair,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../services/auth-tokens.js';
import {
  assertNotLocked,
  clearLoginFailures,
  registerLoginFailure,
} from '../services/login-guard.js';
import { BCRYPT_COST, store } from '../services/store.js';

export const authRouter = Router();

/** Precomputed bcrypt hash used only to keep login timing uniform. */
const DUMMY_PASSWORD_HASH =
  '$2b$12$Se/F6FfPqBuofpWkHMOGaeBQ.gcx4aojgrmGNsqVfSjWMPvTvTmWy';

const passwordSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres.')
  .regex(/[A-Za-z]/, 'Senha deve conter pelo menos uma letra.')
  .regex(/[0-9]/, 'Senha deve conter pelo menos um número.');

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: passwordSchema,
  name: z.string().min(2).max(120).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

authRouter.post('/auth/register', authRateLimit, async (req, res, next) => {
  try {
    const body = credentialsSchema.parse(req.body);
    if (store.findUserByEmail(body.email)) {
      throw new HttpError(409, 'E-mail já cadastrado.');
    }

    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      name: body.name?.trim() || body.email.split('@')[0]!,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, BCRYPT_COST),
      createdAt: now,
      updatedAt: now,
    };
    store.users.set(user.id, user);
    store.profiles.set(user.id, {
      userId: user.id,
      receiverName: user.name,
      updatedAt: now,
    });

    const tokens = issueTokenPair(user.id, user.email);
    res.status(201).json({
      ...tokens,
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/login', authRateLimit, async (req, res, next) => {
  try {
    const body = credentialsSchema.omit({ name: true }).parse(req.body);
    const ip = clientIp(req);
    assertNotLocked(body.email, ip);

    const user = store.findUserByEmail(body.email);
    const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordOk = await bcrypt.compare(body.password, hash);

    if (!user || !passwordOk) {
      registerLoginFailure(body.email, ip);
      throw new HttpError(401, 'E-mail ou senha inválidos.');
    }

    clearLoginFailures(body.email, ip);
    const tokens = issueTokenPair(user.id, user.email);
    res.json({
      ...tokens,
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/refresh', refreshRateLimit, (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    const rotated = rotateRefreshToken(body.refreshToken);
    const user = store.users.get(rotated.userId);
    if (!user) {
      throw new HttpError(401, 'Refresh token inválido.');
    }

    res.json({
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: rotated.expiresIn,
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/auth/logout', authRateLimit, (req, res, next) => {
  try {
    const body = refreshSchema.partial().parse(req.body ?? {});
    if (body.refreshToken) {
      revokeRefreshToken(body.refreshToken);
    }
    res.json({ ok: true });
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

function publicUser(user: { id: string; name: string; email: string }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
