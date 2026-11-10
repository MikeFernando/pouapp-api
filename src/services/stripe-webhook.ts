import Stripe from 'stripe';
import { env } from '../config/env.js';
import type { LicenseStatus, User } from '../types/domain.js';
import { store } from './store.js';

export function getStripe(): Stripe | null {
  if (!env.stripeSecretKey) return null;
  return new Stripe(env.stripeSecretKey);
}

function asCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if ('deleted' in customer && customer.deleted) return null;
  return customer.id;
}

function asSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined,
): string | null {
  if (!subscription) return null;
  if (typeof subscription === 'string') return subscription;
  return subscription.id;
}

function emailFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  const raw =
    metadata?.pouapp_email?.trim() ||
    metadata?.email?.trim() ||
    metadata?.user_email?.trim();
  return raw ? raw.toLowerCase() : null;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function fallbackPaidUntilIso(): string {
  return new Date(
    Date.now() + env.stripeFallbackPaidDays * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function activateUser(
  user: User,
  patch: {
    paidUntil: string | null;
    status?: LicenseStatus;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  },
) {
  store.setLicense(user.id, {
    status: patch.status ?? 'active',
    paidUntil: patch.paidUntil,
    ...(patch.stripeCustomerId
      ? { stripeCustomerId: patch.stripeCustomerId }
      : {}),
    ...(patch.stripeSubscriptionId
      ? { stripeSubscriptionId: patch.stripeSubscriptionId }
      : {}),
  });
}

function resolveUser(input: {
  email?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  clientReferenceId?: string | null;
}): User | undefined {
  const ref = input.clientReferenceId?.trim();
  const email =
    input.email?.trim().toLowerCase() ||
    (ref && looksLikeEmail(ref) ? ref.toLowerCase() : null);

  return store.findUserForStripe({
    email,
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
  });
}

function periodEndFromInvoice(invoice: Stripe.Invoice): string | null {
  for (const line of invoice.lines?.data ?? []) {
    if (line.period?.end) return unixToIso(line.period.end);
  }
  return null;
}

function licenseStatusFromSubscription(
  status: Stripe.Subscription.Status,
): LicenseStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return status === 'canceled' ? 'canceled' : 'unpaid';
    default:
      return 'unpaid';
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  const customerId = asCustomerId(session.customer);
  const subscriptionId = asSubscriptionId(session.subscription);
  const email =
    emailFromMetadata(session.metadata) ||
    session.customer_email ||
    session.customer_details?.email ||
    null;

  const user = resolveUser({
    email,
    customerId,
    subscriptionId,
    clientReferenceId: session.client_reference_id,
  });

  if (!user) {
    console.warn('[stripe] checkout.session.completed: user not found', {
      email,
      customerId,
      clientReferenceId: session.client_reference_id,
    });
    return;
  }

  let paidUntil = fallbackPaidUntilIso();
  if (subscriptionId && env.stripeSecretKey) {
    try {
      const stripe = getStripe();
      const subscription = await stripe!.subscriptions.retrieve(subscriptionId);
      paidUntil =
        subscriptionPeriodEnd(subscription) ?? fallbackPaidUntilIso();
    } catch (error) {
      console.warn('[stripe] failed to load subscription period', error);
    }
  }

  activateUser(user, {
    status: 'active',
    paidUntil,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });

  console.info('[stripe] license activated via checkout', {
    email: user.email,
    paidUntil,
    customerId,
    subscriptionId,
  });
}

function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = asCustomerId(invoice.customer);
  const subscriptionId = asSubscriptionId(
    // Stripe typings vary by API version; subscription may live on parent.
    (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null })
      .subscription,
  );
  const email =
    emailFromMetadata(invoice.metadata) ||
    invoice.customer_email ||
    null;

  const user = resolveUser({ email, customerId, subscriptionId });
  if (!user) {
    console.warn('[stripe] invoice.paid: user not found', {
      email,
      customerId,
      subscriptionId,
    });
    return;
  }

  activateUser(user, {
    status: 'active',
    paidUntil: periodEndFromInvoice(invoice) ?? fallbackPaidUntilIso(),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });

  console.info('[stripe] license renewed via invoice.paid', {
    email: user.email,
    customerId,
    subscriptionId,
  });
}

function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = asCustomerId(invoice.customer);
  const subscriptionId = asSubscriptionId(
    (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null })
      .subscription,
  );
  const user = resolveUser({
    email: invoice.customer_email,
    customerId,
    subscriptionId,
  });
  if (!user) {
    console.warn('[stripe] invoice.payment_failed: user not found', {
      customerId,
      subscriptionId,
    });
    return;
  }

  const current = store.ensureLicense(user.id);
  store.setLicense(user.id, {
    status: 'past_due',
    paidUntil: current.paidUntil,
    stripeCustomerId: customerId ?? current.stripeCustomerId,
    stripeSubscriptionId: subscriptionId ?? current.stripeSubscriptionId,
  });

  console.info('[stripe] license marked past_due', { email: user.email });
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const direct = (
    subscription as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  if (direct) return unixToIso(direct);

  const itemEnd = subscription.items?.data?.[0]?.current_period_end;
  return unixToIso(itemEnd);
}

function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = asCustomerId(subscription.customer);
  const user = resolveUser({
    email: emailFromMetadata(subscription.metadata),
    customerId,
    subscriptionId: subscription.id,
  });
  if (!user) {
    console.warn('[stripe] subscription.updated: user not found', {
      customerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  const status = licenseStatusFromSubscription(subscription.status);
  const paidUntil =
    status === 'active' ? subscriptionPeriodEnd(subscription) : null;

  store.setLicense(user.id, {
    status,
    paidUntil,
    stripeCustomerId: customerId ?? undefined,
    stripeSubscriptionId: subscription.id,
  });

  console.info('[stripe] license synced from subscription.updated', {
    email: user.email,
    status,
    paidUntil,
  });
}

function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = asCustomerId(subscription.customer);
  const user = resolveUser({
    email: emailFromMetadata(subscription.metadata),
    customerId,
    subscriptionId: subscription.id,
  });
  if (!user) {
    console.warn('[stripe] subscription.deleted: user not found', {
      customerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  store.setLicense(user.id, {
    status: 'canceled',
    paidUntil: null,
    stripeCustomerId: customerId ?? undefined,
    stripeSubscriptionId: subscription.id,
  });

  console.info('[stripe] license canceled via subscription.deleted', {
    email: user.email,
  });
}

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
      break;
    case 'invoice.paid':
      handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case 'invoice.payment_failed':
      handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case 'customer.subscription.updated':
      handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case 'customer.subscription.deleted':
      handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    default:
      console.info('[stripe] ignored event', event.type);
  }
}

export function constructStripeEvent(
  rawBody: Buffer,
  signature: string | string[] | undefined,
): Stripe.Event {
  if (!env.stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  if (typeof signature !== 'string' || signature.length === 0) {
    throw new Error('Missing Stripe-Signature header');
  }

  const stripe = getStripe();
  if (!stripe) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    env.stripeWebhookSecret,
  );
}
