import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { businessRouter } from './routes/business.js';
import { customersRouter } from './routes/customers.js';
import { healthRouter } from './routes/health.js';
import { notesRouter } from './routes/notes.js';
import { productsRouter } from './routes/products.js';
import { receiptsRouter } from './routes/receipts.js';
import { salesRouter } from './routes/sales.js';
import { workspaceRouter } from './routes/workspace.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','),
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  app.use(healthRouter);
  app.use(authRouter);
  app.use(customersRouter);
  app.use(productsRouter);
  app.use(businessRouter);
  app.use(notesRouter);
  app.use(salesRouter);
  app.use(receiptsRouter);
  app.use(workspaceRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
