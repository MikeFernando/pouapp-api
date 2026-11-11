import { createApp } from '../src/app.ts';
import { store } from '../src/services/store.ts';

await store.seed();
const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

async function register(name, email) {
  const res = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'Senha123' }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`register ${email}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

const a = await register('Conta A', `tenant-a-${Date.now()}@test.dev`);
const b = await register('Conta B', `tenant-b-${Date.now()}@test.dev`);

const createA = await fetch(`${base}/customers`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${a.accessToken}`,
  },
  body: JSON.stringify({ name: 'Cliente Só Da A', status: 'active' }),
});
const created = await createA.json();
console.log('create A', createA.status, created.customer?.name);

const listA = await fetch(`${base}/customers`, {
  headers: { authorization: `Bearer ${a.accessToken}` },
});
const listB = await fetch(`${base}/customers`, {
  headers: { authorization: `Bearer ${b.accessToken}` },
});
const bodyA = await listA.json();
const bodyB = await listB.json();
console.log('list A', listA.status, bodyA.total, bodyA.items?.map((c) => c.name));
console.log('list B', listB.status, bodyB.total, bodyB.items?.map((c) => c.name));

const leak = await fetch(`${base}/customers/${created.customer.id}`, {
  headers: { authorization: `Bearer ${b.accessToken}` },
});
console.log('B reads A customer', leak.status, await leak.json());

const ok =
  bodyA.total === 1 &&
  bodyB.total === 0 &&
  leak.status === 404 &&
  bodyA.items?.[0]?.name === 'Cliente Só Da A';

server.close();
if (!ok) {
  console.error('FAIL tenant isolation');
  process.exit(1);
}
console.log('OK tenant customers isolated');
