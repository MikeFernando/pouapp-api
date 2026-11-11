import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { buildHomeBoard, isoToday } from '../services/home-board.js';

export const workspaceRouter = Router();
workspaceRouter.use(requireAuth);

workspaceRouter.get('/workspace/home', (req: AuthedRequest, res, next) => {
  try {
    const query = z
      .object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(req.query);
    const date = query.date ?? isoToday();
    res.json({ home: buildHomeBoard(date, req.user!.sub) });
  } catch (error) {
    next(error);
  }
});
