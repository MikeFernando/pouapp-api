import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { store } from '../services/store.js';

export const businessRouter = Router();

const profileSchema = z.object({
  pixKeyType: z.enum(['cpfCnpj', 'phone', 'email', 'random']),
  pixKey: z.string().min(1),
  receiverName: z.string().min(2),
});

businessRouter.use(requireAuth);

businessRouter.get('/business/profile', (req: AuthedRequest, res, next) => {
  try {
    const profile = store.profiles.get(req.user!.sub);
    if (!profile) throw new HttpError(404, 'Perfil não encontrado.');
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

businessRouter.put('/business/profile', (req: AuthedRequest, res, next) => {
  try {
    const body = profileSchema.parse(req.body);
    const profile = {
      userId: req.user!.sub,
      pixKeyType: body.pixKeyType,
      pixKey: body.pixKey.trim(),
      receiverName: body.receiverName.trim(),
      updatedAt: new Date().toISOString(),
    };
    store.profiles.set(profile.userId, profile);
    res.json({ profile });
  } catch (error) {
    next(error);
  }
});
