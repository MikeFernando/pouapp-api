import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { store } from '../services/store.js';
import type { CustomerStatus } from '../types/domain.js';

export const customersRouter = Router();

const customerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().optional(),
  type: z.enum(['individual', 'company']).default('individual'),
  status: z.enum(['active', 'inactive']).default('active'),
});

customersRouter.use(requireAuth);

customersRouter.get('/customers', (req, res) => {
  const search = String(req.query.search ?? '')
    .trim()
    .toLowerCase();
  const status = req.query.status as CustomerStatus | undefined;

  let items = [...store.customers.values()];
  if (status === 'active' || status === 'inactive') {
    items = items.filter((customer) => customer.status === status);
  }
  if (search) {
    items = items.filter((customer) =>
      customer.name.toLowerCase().includes(search),
    );
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  res.json({
    items,
    total: items.length,
  });
});

customersRouter.get('/customers/:id', (req, res, next) => {
  try {
    const customer = store.customers.get(req.params.id);
    if (!customer) throw new HttpError(404, 'Cliente não encontrado.');
    res.json({ customer });
  } catch (error) {
    next(error);
  }
});

customersRouter.post('/customers', (req, res, next) => {
  try {
    const body = customerSchema.parse(req.body);
    const timestamp = new Date().toISOString();
    const customer = {
      id: randomUUID(),
      type: body.type,
      name: body.name.trim(),
      phone: body.phone?.trim() || undefined,
      status: body.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.customers.set(customer.id, customer);
    res.status(201).json({ customer });
  } catch (error) {
    next(error);
  }
});

customersRouter.patch('/customers/:id/status', (req, res, next) => {
  try {
    const body = z
      .object({ status: z.enum(['active', 'inactive']) })
      .parse(req.body);
    const customer = store.customers.get(req.params.id);
    if (!customer) throw new HttpError(404, 'Cliente não encontrado.');

    const updated = {
      ...customer,
      status: body.status,
      updatedAt: new Date().toISOString(),
    };
    store.customers.set(updated.id, updated);
    res.json({ customer: updated });
  } catch (error) {
    next(error);
  }
});
