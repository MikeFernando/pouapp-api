import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'pou-stripe-'));
process.env.DATA_FILE = path.join(tmp, 'store.json');
process.env.DATA_DIR = tmp;
process.env.JWT_SECRET = 'dev-pouapp-secret-change-me-32chars';
process.env.LICENSE_TRIAL_DAYS = '0';
process.env.STRIPE_FALLBACK_PAID_DAYS = '31';

const { store } = await import('../src/services/store.ts');
const { processStripeEvent } = await import('../src/services/stripe-webhook.ts');

await store.load();
await store.seed();

const email = `stripe-${Date.now()}@test.dev`;
const now = new Date().toISOString();
const user = {
  id: 'user-stripe-1',
  name: 'Stripe Test',
  email,
  passwordHash: 'x',
  createdAt: now,
  updatedAt: now,
};
store.users.set(user.id, user);
store.ensureLicense(user.id, { trialDays: 0 });

await processStripeEvent({
  id: 'evt_test_1',
  object: 'event',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test',
      object: 'checkout.session',
      customer: 'cus_test_1',
      customer_email: email,
      customer_details: { email },
      metadata: { pouapp_email: email },
      subscription: 'sub_test_1',
      client_reference_id: null,
    },
  },
});

const license = store.licenses.get(user.id);
console.log('after checkout', {
  status: license?.status,
  paidUntil: license?.paidUntil,
  stripeCustomerId: license?.stripeCustomerId,
  stripeSubscriptionId: license?.stripeSubscriptionId,
});

if (license?.status !== 'active' || !license.paidUntil) {
  console.error('expected active license after checkout');
  process.exit(1);
}

await processStripeEvent({
  id: 'evt_test_2',
  object: 'event',
  type: 'customer.subscription.deleted',
  data: {
    object: {
      id: 'sub_test_1',
      object: 'subscription',
      customer: 'cus_test_1',
      status: 'canceled',
      metadata: {},
    },
  },
});

const canceled = store.licenses.get(user.id);
console.log('after cancel', {
  status: canceled?.status,
  paidUntil: canceled?.paidUntil,
  activeViewPaid: canceled?.paidUntil,
});

if (canceled?.status !== 'canceled' || canceled.paidUntil !== null) {
  console.error('expected canceled license');
  process.exit(1);
}

await rm(tmp, { recursive: true, force: true });
console.log('stripe webhook smoke ok');
