import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Dados inválidos.',
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
}
