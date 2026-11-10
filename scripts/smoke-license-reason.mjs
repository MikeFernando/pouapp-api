import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'pou-reason-'));
process.env.DATA_FILE = path.join(tmp, 'store.json');
process.env.DATA_DIR = tmp;
process.env.JWT_SECRET = 'dev-pouapp-secret-change-me-32chars';
process.env.LICENSE_TRIAL_DAYS = '0';
process.env.LICENSE_ADMIN_KEY = 'dev-license-admin-key';

const { store } = await import('../src/services/store.ts');
const { createApp } = await import('../src/app.ts');
const { env } = await import('../src/config/env.ts');

await store.load();
await store.seed();

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function register(email) {
  const res = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Senha123', name: email }),
  });
  const body = await res.json();
  if (res.status !== 201) throw new Error(JSON.stringify(body));
  return body;
}

const paid = await register(`pago-${Date.now()}@test.dev`);
const unpaid = await register(`outro-${Date.now()}@test.dev`);

let lic = await fetch(`${base}/license`, {
  headers: { authorization: `Bearer ${unpaid.accessToken}` },
}).then((r) => r.json());
console.log('before pay', lic.license.reason, lic.license.active);

await fetch(`${base}/admin/license`, {
  method: 'PUT',
  headers: {
    'content-type': 'application/json',
    'x-license-admin-key': env.licenseAdminKey,
  },
  body: JSON.stringify({
    email: paid.user.email,
    status: 'active',
    paidUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
  }),
});

lic = await fetch(`${base}/license`, {
  headers: { authorization: `Bearer ${unpaid.accessToken}` },
}).then((r) => r.json());
console.log('after other paid', lic.license);

const paidLic = await fetch(`${base}/license`, {
  headers: { authorization: `Bearer ${paid.accessToken}` },
}).then((r) => r.json());
console.log('paid account', paidLic.license.active, paidLic.license.reason);

server.close();
await rm(tmp, { recursive: true, force: true });

if (lic.license.reason !== 'wrong_email' || !lic.license.paidEmail) {
  process.exit(1);
}
if (paidLic.license.active !== true) process.exit(1);
console.log('smoke ok');
