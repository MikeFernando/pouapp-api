import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'pou-store-'));
process.env.DATA_FILE = path.join(tmp, 'store.json');
process.env.DATA_DIR = tmp;
process.env.LICENSE_ADMIN_KEY = 'dev-license-admin-key';
process.env.LICENSE_TRIAL_DAYS = '7';
process.env.JWT_SECRET = 'dev-pouapp-secret-change-me-32chars';

const { store } = await import('../src/services/store.ts');
const { createApp } = await import('../src/app.ts');
const { env } = await import('../src/config/env.ts');

await store.load();
await store.seed();

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const email = `persist-${Date.now()}@test.dev`;
const reg = await fetch(`${base}/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'Senha123', name: 'Persist' }),
});
const regBody = await reg.json();
if (reg.status !== 201) {
  console.error('register failed', reg.status, regBody);
  process.exit(1);
}

await fetch(`${base}/admin/license`, {
  method: 'PUT',
  headers: {
    'content-type': 'application/json',
    'x-license-admin-key': env.licenseAdminKey,
  },
  body: JSON.stringify({
    email,
    status: 'active',
    paidUntil: '2027-01-01T00:00:00.000Z',
  }),
});

await store.flush();
server.close();

// Simulate process restart: new store module state by reloading maps via load
const { store: store2 } = await import('../src/services/store.ts');
// same singleton — clear and reload from disk
store2.users.clear();
store2.profiles.clear();
store2.licenses.clear();
store2.customers.clear();
store2.products.clear();
store2.notes.clear();
store2.sales.clear();
store2.receipts.clear();
store2.refreshSessions.clear();
await store2.load();

const user = store2.findUserByEmail(email);
const license = store2.licenses.get(user.id);
console.log({
  dataFile: env.dataFile,
  userFound: Boolean(user),
  email: user?.email,
  licenseStatus: license?.status,
  paidUntil: license?.paidUntil,
  customers: store2.customers.size,
});

if (!user || license?.status !== 'active' || license?.paidUntil !== '2027-01-01T00:00:00.000Z') {
  await rm(tmp, { recursive: true, force: true });
  process.exit(1);
}

await rm(tmp, { recursive: true, force: true });
console.log('persist smoke ok');
