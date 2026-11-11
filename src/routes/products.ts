import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { store } from '../services/store.js';

export const productsRouter = Router();

const productSchema = z.object({
  name: z.string().min(2).max(120),
  unit: z.enum(['kilogram', 'piece', 'bunch', 'box', 'dozen']),
  salePriceCents: z.number().int().nonnegative(),
  active: z.boolean().default(true),
});

productsRouter.use(requireAuth);

productsRouter.get('/products', (req: AuthedRequest, res) => {
  const search = String(req.query.search ?? '')
    .trim()
    .toLowerCase();
  let items = store.listProductsForUser(req.user!.sub);
  if (search) {
    items = items.filter((product) =>
      product.name.toLowerCase().includes(search),
    );
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  res.json({ items, total: items.length });
});

productsRouter.post('/products', (req: AuthedRequest, res, next) => {
  try {
    const body = productSchema.parse(req.body);
    const timestamp = new Date().toISOString();
    const product = {
      id: randomUUID(),
      userId: req.user!.sub,
      name: body.name.trim(),
      unit: body.unit,
      salePriceCents: body.salePriceCents,
      active: body.active,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.products.set(product.id, product);
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

productsRouter.patch('/products/:id', (req: AuthedRequest, res, next) => {
  try {
    const body = productSchema.partial().parse(req.body);
    const product = store.getProductForUser(
      String(req.params.id),
      req.user!.sub,
    );
    if (!product) throw new HttpError(404, 'Produto não encontrado.');

    const updated = {
      ...product,
      ...body,
      name: body.name?.trim() ?? product.name,
      updatedAt: new Date().toISOString(),
    };
    store.products.set(updated.id, updated);
    res.json({ product: updated });
  } catch (error) {
    next(error);
  }
});
