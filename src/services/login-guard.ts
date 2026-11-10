import { HttpError } from '../middleware/error.js';

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptState {
  failures: number;
  lockedUntil?: number;
}

const attempts = new Map<string, AttemptState>();

function keyFor(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

export function assertNotLocked(email: string, ip: string): void {
  const state = attempts.get(keyFor(email, ip));
  if (!state?.lockedUntil) return;

  if (state.lockedUntil > Date.now()) {
    throw new HttpError(
      429,
      'Muitas tentativas. Tente novamente em alguns minutos.',
    );
  }

  attempts.delete(keyFor(email, ip));
}

export function registerLoginFailure(email: string, ip: string): void {
  const key = keyFor(email, ip);
  const state = attempts.get(key) ?? { failures: 0 };
  state.failures += 1;

  if (state.failures >= MAX_FAILURES) {
    state.lockedUntil = Date.now() + LOCKOUT_MS;
    state.failures = 0;
  }

  attempts.set(key, state);
}

export function clearLoginFailures(email: string, ip: string): void {
  attempts.delete(keyFor(email, ip));
}

/** Exposed for tests / diagnostics. */
export function _resetLoginGuardForTests(): void {
  attempts.clear();
}
