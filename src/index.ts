import { createApp } from './app.js';
import { env } from './config/env.js';
import { store } from './services/store.js';

async function main() {
  await store.seed();
  const app = createApp();

  app.listen(env.port, () => {
    console.log(`pouapp-api listening on http://localhost:${env.port}`);
    console.log('seed login: edipo@pouapp.com / Edipo123');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
