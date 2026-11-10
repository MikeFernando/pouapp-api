import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { businessRouter } from './routes/business.js';
import { customersRouter } from './routes/customers.js';
import { healthRouter } from './routes/health.js';
import { productsRouter } from './routes/products.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','),
    }),
  );
  app.use(express.json());

  app.use(healthRouter);
  app.use(authRouter);
  app.use(customersRouter);
  app.use(productsRouter);
  app.use(businessRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
