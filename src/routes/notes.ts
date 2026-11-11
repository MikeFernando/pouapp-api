import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { store } from '../services/store.js';

export const notesRouter = Router();
notesRouter.use(requireAuth);

const noteSchema = z.object({
  customerId: z.string().uuid(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalCents: z.number().int().positive(),
  status: z.enum(['draft', 'delivered']).default('draft'),
});

notesRouter.get('/notes', (req: AuthedRequest, res) => {
  const status = req.query.status as string | undefined;
  let items = store.listNotesForUser(req.user!.sub);
  if (status === 'draft' || status === 'delivered') {
    items = items.filter((note) => note.status === status);
  }
  items.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  res.json({ items, total: items.length });
});

notesRouter.post('/notes', (req: AuthedRequest, res, next) => {
  try {
    const body = noteSchema.parse(req.body);
    const userId = req.user!.sub;
    if (!store.getCustomerForUser(body.customerId, userId)) {
      throw new HttpError(404, 'Cliente não encontrado.');
    }
    const timestamp = new Date().toISOString();
    const note = {
      id: randomUUID(),
      userId,
      customerId: body.customerId,
      status: body.status,
      dueOn: body.dueOn,
      totalCents: body.totalCents,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.notes.set(note.id, note);
    res.status(201).json({ note });
  } catch (error) {
    next(error);
  }
});
