import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireLicenseAdmin } from '../middleware/admin.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { toLicenseView } from '../services/license.js';
import { store } from '../services/store.js';

export const licenseRouter = Router();

const paidUntilSchema = z
  .union([z.string().min(1), z.null()])
  .refine(
    (value) => value === null || Number.isFinite(Date.parse(value)),
    'paidUntil inválido.',
  )
  .transform((value) =>
    value === null ? null : new Date(value).toISOString(),
  );

const adminSetSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  status: z.enum(['active', 'past_due', 'canceled', 'unpaid']),
  /** ISO date/datetime. Prefer end-of-day when extending a month. */
  paidUntil: paidUntilSchema,
  stripeCustomerId: z.string().min(1).optional(),
  stripeSubscriptionId: z.string().min(1).optional(),
});

/** Current account license — used by the app kill switch. */
licenseRouter.get('/license', requireAuth, (req: AuthedRequest, res, next) => {
  try {
    const license = store.ensureLicense(req.user!.sub, {
      trialDays: env.licenseTrialDays,
    });
    res.json({ license: toLicenseView(license) });
  } catch (error) {
    next(error);
  }
});

/**
 * Manual activation after Stripe Payment Link / invoice payment.
 * Header: X-License-Admin-Key
 */
licenseRouter.put(
  '/admin/license',
  requireLicenseAdmin,
  (req: AuthedRequest, res, next) => {
    try {
      const body = adminSetSchema.parse(req.body);
      const user = store.findUserByEmail(body.email);
      if (!user) throw new HttpError(404, 'Usuário não encontrado.');

      const license = store.setLicense(user.id, {
        status: body.status,
        paidUntil: body.paidUntil,
        stripeCustomerId: body.stripeCustomerId,
        stripeSubscriptionId: body.stripeSubscriptionId,
      });

      res.json({
        user: { id: user.id, email: user.email, name: user.name },
        license: toLicenseView(license),
        raw: license,
      });
    } catch (error) {
      next(error);
    }
  },
);
