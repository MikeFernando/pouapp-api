import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './error.js';
import type { AuthTokenPayload } from '../types/domain.js';
import { verifyAccessToken } from '../services/auth-tokens.js';

export type AuthedRequest = Request & {
  user?: AuthTokenPayload;
};

export function requireAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, 'Token ausente.'));
    return;
  }

  try {
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      next(new HttpError(401, 'Token ausente.'));
      return;
    }
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(new HttpError(401, 'Token inválido.'));
  }
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
