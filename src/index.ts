import { createApp } from './app.js';
import { env } from './config/env.js';
import { store } from './services/store.js';

async function main() {
  await store.load();
  await store.seed();
  const app = createApp();

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`pouapp-api listening on http://0.0.0.0:${env.port}`);
    console.log(`store file → ${env.dataFile}`);
    console.log('no seed user — create an account via /auth/register');
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal}: flushing store…`);
    try {
      await store.flush();
    } catch (error) {
      console.error('failed to flush store', error);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
