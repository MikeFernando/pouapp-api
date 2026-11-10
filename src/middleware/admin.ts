import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { HttpError } from './error.js';

/** Protects /admin/* routes with X-License-Admin-Key. */
export function requireLicenseAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const key = req.headers['x-license-admin-key'];
  if (typeof key !== 'string' || key.length === 0) {
    next(new HttpError(401, 'Chave de admin ausente.'));
    return;
  }
  if (key !== env.licenseAdminKey) {
    next(new HttpError(403, 'Chave de admin inválida.'));
    return;
  }
  next();
}
