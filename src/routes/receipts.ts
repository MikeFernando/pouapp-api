import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { store } from '../services/store.js';

export const receiptsRouter = Router();
receiptsRouter.use(requireAuth);

const receiptSchema = z.object({
  customerId: z.string().uuid(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCents: z.number().int().positive(),
  allocations: z
    .array(
      z.object({
        saleId: z.string().uuid(),
        amountCents: z.number().int().positive(),
      }),
    )
    .default([]),
});

receiptsRouter.get('/receipts', (req: AuthedRequest, res) => {
  const paidOn = String(req.query.paidOn ?? '').trim();
  let items = store.listReceiptsForUser(req.user!.sub);
  if (paidOn) {
    items = items.filter((receipt) => receipt.paidOn === paidOn);
  }
  items.sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  res.json({ items, total: items.length });
});

receiptsRouter.post('/receipts', (req: AuthedRequest, res, next) => {
  try {
    const body = receiptSchema.parse(req.body);
    const userId = req.user!.sub;
    if (!store.getCustomerForUser(body.customerId, userId)) {
      throw new HttpError(404, 'Cliente não encontrado.');
    }

    let remaining = body.amountCents;
    const allocations = [];
    for (const allocation of body.allocations) {
      const sale = store.sales.get(allocation.saleId);
      if (!sale || sale.userId !== userId) {
        throw new HttpError(404, 'Venda não encontrada.');
      }
      if (sale.customerId !== body.customerId) {
        throw new HttpError(400, 'Alocação de outro cliente.');
      }
      const open = Math.max(0, sale.totalCents - sale.allocatedCents);
      const applied = Math.min(open, allocation.amountCents, remaining);
      if (applied <= 0) continue;
      sale.allocatedCents += applied;
      sale.updatedAt = new Date().toISOString();
      store.sales.set(sale.id, sale);
      allocations.push({ saleId: sale.id, amountCents: applied });
      remaining -= applied;
    }

    // Auto-allocate leftover FIFO by due date for this customer.
    if (remaining > 0) {
      const openSales = store
        .listSalesForUser(userId)
        .filter(
          (sale) =>
            sale.customerId === body.customerId &&
            sale.totalCents - sale.allocatedCents > 0,
        )
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
      for (const sale of openSales) {
        if (remaining <= 0) break;
        const open = sale.totalCents - sale.allocatedCents;
        const applied = Math.min(open, remaining);
        sale.allocatedCents += applied;
        sale.updatedAt = new Date().toISOString();
        store.sales.set(sale.id, sale);
        allocations.push({ saleId: sale.id, amountCents: applied });
        remaining -= applied;
      }
    }

    const receipt = {
      id: randomUUID(),
      userId,
      customerId: body.customerId,
      paidOn: body.paidOn,
      amountCents: body.amountCents,
      allocations,
      createdAt: new Date().toISOString(),
    };
    store.receipts.set(receipt.id, receipt);
    res.status(201).json({ receipt });
  } catch (error) {
    next(error);
  }
});
