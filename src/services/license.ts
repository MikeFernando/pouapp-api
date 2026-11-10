import type { License, LicenseView, User } from '../types/domain.js';
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

function findOtherActivePaid(
  exceptUserId: string,
  at = new Date(),
): { license: License; user: User } | undefined {
  for (const license of store.licenses.values()) {
    if (license.userId === exceptUserId) continue;
    if (!isLicenseActive(license, at)) continue;
    const user = store.users.get(license.userId);
    if (!user) continue;
    return { license, user };
  }
  return undefined;
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

  const otherPaid = findOtherActivePaid(license.userId, at);
  if (otherPaid) {
    return {
      active: false,
      status: license.status,
      paidUntil: license.paidUntil,
      message: WRONG_EMAIL_MESSAGE,
      reason: 'wrong_email',
      paidEmail: otherPaid.user.email,
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
