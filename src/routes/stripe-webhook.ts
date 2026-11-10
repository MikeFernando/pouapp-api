import { Router, type Request, type Response } from 'express';
import {
  constructStripeEvent,
  processStripeEvent,
} from '../services/stripe-webhook.js';

export const stripeWebhookRouter = Router();

/**
 * Stripe requires the raw request body for signature verification.
 * Mounted at /webhooks/stripe with express.raw() before express.json().
 */
stripeWebhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({
        error: 'Webhook body must be raw Buffer (check express.raw wiring).',
      });
      return;
    }

    const event = constructStripeEvent(
      rawBody,
      req.headers['stripe-signature'],
    );
    await processStripeEvent(event);
    res.json({ received: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Webhook inválido.';
    console.error('[stripe webhook]', message);
    res.status(400).json({ error: message });
  }
});
