import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { store } from '../services/store.js';

export const salesRouter = Router();
salesRouter.use(requireAuth);

const saleSchema = z.object({
  customerId: z.string().uuid(),
  totalCents: z.number().int().positive(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

salesRouter.get('/sales', (req: AuthedRequest, res) => {
  const items = store
    .listSalesForUser(req.user!.sub)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  res.json({ items, total: items.length });
});

salesRouter.post('/sales', (req: AuthedRequest, res, next) => {
  try {
    const body = saleSchema.parse(req.body);
    const userId = req.user!.sub;
    if (!store.getCustomerForUser(body.customerId, userId)) {
      throw new HttpError(404, 'Cliente não encontrado.');
    }
    const timestamp = new Date().toISOString();
    const sale = {
      id: randomUUID(),
      userId,
      customerId: body.customerId,
      totalCents: body.totalCents,
      allocatedCents: 0,
      occurredOn: body.occurredOn,
      dueOn: body.dueOn,
      sale: true as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.sales.set(sale.id, sale);
    res.status(201).json({ sale });
  } catch (error) {
    next(error);
  }
});
