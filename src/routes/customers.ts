import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { store } from '../services/store.js';
import type { CustomerStatus } from '../types/domain.js';

export const customersRouter = Router();

const customerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  type: z.enum(['individual', 'company']).default('individual'),
  status: z.enum(['active', 'inactive']).default('active'),
});

customersRouter.use(requireAuth);

customersRouter.get('/customers', (req: AuthedRequest, res) => {
  const userId = req.user!.sub;
  const search = String(req.query.search ?? '')
    .trim()
    .toLowerCase();
  const status = req.query.status as CustomerStatus | undefined;

  let items = store.listCustomersForUser(userId);
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

customersRouter.get('/customers/:id', (req: AuthedRequest, res, next) => {
  try {
    const customer = store.getCustomerForUser(
      String(req.params.id),
      req.user!.sub,
    );
    if (!customer) throw new HttpError(404, 'Cliente não encontrado.');
    res.json({ customer });
  } catch (error) {
    next(error);
  }
});

customersRouter.post('/customers', (req: AuthedRequest, res, next) => {
  try {
    const body = customerSchema.parse(req.body);
    const timestamp = new Date().toISOString();
    const customer = {
      id: randomUUID(),
      userId: req.user!.sub,
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

customersRouter.patch('/customers/:id/status', (req: AuthedRequest, res, next) => {
  try {
    const body = z
      .object({ status: z.enum(['active', 'inactive']) })
      .parse(req.body);
    const customer = store.getCustomerForUser(
      String(req.params.id),
      req.user!.sub,
    );
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

customersRouter.delete('/customers/:id', (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.sub;
    const customerId = String(req.params.id);
    const customer = store.getCustomerForUser(customerId, userId);
    if (!customer) throw new HttpError(404, 'Cliente não encontrado.');

    for (const note of store.listNotesForUser(userId)) {
      if (note.customerId === customerId) {
        store.notes.delete(note.id);
      }
    }
    store.customers.delete(customerId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
