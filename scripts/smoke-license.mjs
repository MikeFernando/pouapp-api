import { createApp } from '../src/app.ts';
import { env } from '../src/config/env.ts';
import { store } from '../src/services/store.ts';

await store.seed();
const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const email = 'parente@test.dev';
const password = 'Senha123';

const reg = await fetch(`${base}/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'Parente' }),
});
const regBody = await reg.json();
console.log('register', reg.status, regBody.user?.email);

const lic1 = await fetch(`${base}/license`, {
  headers: { authorization: `Bearer ${regBody.accessToken}` },
});
console.log('license after register', lic1.status, await lic1.json());

const cut = await fetch(`${base}/admin/license`, {
  method: 'PUT',
  headers: {
    'content-type': 'application/json',
    'x-license-admin-key': env.licenseAdminKey,
  },
  body: JSON.stringify({ email, status: 'unpaid', paidUntil: null }),
});
console.log('admin unpaid', cut.status, await cut.json());

const lic2 = await fetch(`${base}/license`, {
  headers: { authorization: `Bearer ${regBody.accessToken}` },
});
console.log('license after cut', lic2.status, await lic2.json());

const pay = await fetch(`${base}/admin/license`, {
  method: 'PUT',
  headers: {
    'content-type': 'application/json',
    'x-license-admin-key': env.licenseAdminKey,
  },
  body: JSON.stringify({
    email,
    status: 'active',
    paidUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
  }),
});
console.log('admin paid', pay.status, await pay.json());

const lic3 = await fetch(`${base}/license`, {
  headers: { authorization: `Bearer ${regBody.accessToken}` },
});
console.log('license after pay', lic3.status, await lic3.json());

server.close();
