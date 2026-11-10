import path from 'node:path';
import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = required('JWT_SECRET', 'dev-pouapp-secret-change-me-32chars');

if (nodeEnv === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
const dataFile =
  process.env.DATA_FILE ?? path.join(dataDir, 'store.json');

export const env = {
  port: Number(process.env.PORT ?? 3333),
  nodeEnv,
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  jwtSecret,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  jwtIssuer: process.env.JWT_ISSUER ?? 'pouapp-api',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'pouapp',
  /** Protects PUT /admin/license — set a long random value in production. */
  licenseAdminKey: process.env.LICENSE_ADMIN_KEY ?? 'dev-license-admin-key',
  /** Days of free access after /auth/register. 0 = blocked until you activate. */
  licenseTrialDays: Number(process.env.LICENSE_TRIAL_DAYS ?? 7),
  /** Local JSON persistence (no paid database). */
  dataDir,
  dataFile,
  /** Stripe keys — leave empty until you connect Payment Links / webhooks. */
  stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || '',
  /**
   * Fallback paid window after checkout.session.completed when the invoice
   * period is not available yet (days).
   */
  stripeFallbackPaidDays: Number(
    process.env.STRIPE_FALLBACK_PAID_DAYS?.trim() || 31,
  ),
};
