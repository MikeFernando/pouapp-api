import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from './error.js';
import type { AuthTokenPayload } from '../types/domain.js';

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
    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    req.user = payload;
    next();
  } catch {
    next(new HttpError(401, 'Token inválido.'));
  }
}
