import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.js';
import type { AuthTokenPayload, RefreshSession } from '../types/domain.js';
import { store } from './store.js';

const REFRESH_BYTES = 48;

function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit]!;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(sub: string, email: string): {
  accessToken: string;
  expiresIn: number;
} {
  const expiresInSeconds = Math.floor(
    parseDurationMs(env.jwtAccessExpiresIn) / 1000,
  );
  const accessToken = jwt.sign(
    { sub, email },
    env.jwtSecret,
    {
      expiresIn: expiresInSeconds,
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      jwtid: randomUUID(),
    } as jwt.SignOptions,
  );
  return { accessToken, expiresIn: expiresInSeconds };
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  const payload = jwt.verify(token, env.jwtSecret, {
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
  }) as AuthTokenPayload;

  if (!payload.sub || !payload.email) {
    throw new HttpError(401, 'Token inválido.');
  }
  return payload;
}

export function issueTokenPair(userId: string, email: string) {
  const { accessToken, expiresIn } = signAccessToken(userId, email);
  const refresh = createRefreshSession(userId);
  return {
    accessToken,
    refreshToken: refresh.rawToken,
    expiresIn,
  };
}

function createRefreshSession(
  userId: string,
  familyId: string = randomUUID(),
): { rawToken: string; session: RefreshSession } {
  const rawToken = randomBytes(REFRESH_BYTES).toString('base64url');
  const now = Date.now();
  const session: RefreshSession = {
    id: randomUUID(),
    userId,
    tokenHash: hashRefreshToken(rawToken),
    familyId,
    expiresAt: now + parseDurationMs(env.jwtRefreshExpiresIn),
    createdAt: now,
  };
  store.refreshSessions.set(session.id, session);
  return { rawToken, session };
}

export function rotateRefreshToken(rawRefreshToken: string): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
} {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const existing = store.findRefreshByHash(tokenHash);

  if (!existing) {
    throw new HttpError(401, 'Refresh token inválido.');
  }

  if (existing.revokedAt) {
    // Reuse detection: revoke the whole family.
    store.revokeRefreshFamily(existing.familyId);
    throw new HttpError(401, 'Refresh token reutilizado. Faça login novamente.');
  }

  if (existing.expiresAt <= Date.now()) {
    existing.revokedAt = Date.now();
    store.touch();
    throw new HttpError(401, 'Refresh token expirado.');
  }

  const user = store.users.get(existing.userId);
  if (!user) {
    store.revokeRefreshFamily(existing.familyId);
    throw new HttpError(401, 'Refresh token inválido.');
  }

  existing.revokedAt = Date.now();
  const next = createRefreshSession(existing.userId, existing.familyId);
  existing.replacedById = next.session.id;
  store.touch();

  const { accessToken, expiresIn } = signAccessToken(user.id, user.email);
  return {
    accessToken,
    refreshToken: next.rawToken,
    expiresIn,
    userId: user.id,
  };
}

export function revokeRefreshToken(rawRefreshToken: string): void {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  store.revokeRefreshByHash(tokenHash);
}
