import type { License, LicenseView } from '../types/domain.js';
import { store } from './store.js';

const PAYMENT_REQUIRED_MESSAGE =
  'Serviço suspenso. O acesso será liberado após a confirmação do pagamento.';

const WRONG_EMAIL_MESSAGE =
  'Esta conta não está usando o e-mail que pagou o servidor. Saia e entre com o e-mail do pagamento.';

export function isLicenseActive(license: License, at = new Date()): boolean {
  const paidUntilMs = license.paidUntil
    ? Date.parse(license.paidUntil)
    : Number.NaN;
  const withinPaidPeriod =
    Number.isFinite(paidUntilMs) && paidUntilMs >= at.getTime();
  return license.status === 'active' && withinPaidPeriod;
}

/**
 * If this unpaid account's Stripe customer is already linked to another
 * paid user, point them to that email. Multi-tenant: other people's
 * subscriptions must not block this account.
 */
function findPaidEmailForStripeCustomer(
  license: License,
  exceptUserId: string,
): string | null {
  const customerId = license.stripeCustomerId;
  const subscriptionId = license.stripeSubscriptionId;
  if (!customerId && !subscriptionId) return null;

  for (const other of store.licenses.values()) {
    if (other.userId === exceptUserId) continue;
    if (!isLicenseActive(other)) continue;
    const sameCustomer =
      Boolean(customerId) && other.stripeCustomerId === customerId;
    const sameSubscription =
      Boolean(subscriptionId) && other.stripeSubscriptionId === subscriptionId;
    if (!sameCustomer && !sameSubscription) continue;
    const user = store.users.get(other.userId);
    if (user) return user.email;
  }
  return null;
}

export function toLicenseView(license: License, at = new Date()): LicenseView {
  const active = isLicenseActive(license, at);
  if (active) {
    return {
      active: true,
      status: license.status,
      paidUntil: license.paidUntil,
      message: null,
      reason: null,
      paidEmail: null,
    };
  }

  const paidEmail = findPaidEmailForStripeCustomer(license, license.userId);
  if (paidEmail) {
    return {
      active: false,
      status: license.status,
      paidUntil: license.paidUntil,
      message: WRONG_EMAIL_MESSAGE,
      reason: 'wrong_email',
      paidEmail,
    };
  }

  return {
    active: false,
    status: license.status,
    paidUntil: license.paidUntil,
    message: PAYMENT_REQUIRED_MESSAGE,
    reason: 'payment_required',
    paidEmail: null,
  };
}
