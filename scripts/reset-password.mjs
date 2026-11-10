/**
 * Reset a user's password and print a temporary one to send on WhatsApp.
 *
 * Usage:
 *   npx tsx scripts/reset-password.mjs cliente@email.com
 *   npx tsx scripts/reset-password.mjs cliente@email.com 'NovaSenha1'
 */
import 'dotenv/config';

const email = process.argv[2]?.trim().toLowerCase();
const newPassword = process.argv[3]?.trim();
if (!email) {
  console.error('Usage: npx tsx scripts/reset-password.mjs <email> [newPassword]');
  process.exit(1);
}

const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3333';
const adminKey = process.env.LICENSE_ADMIN_KEY ?? 'dev-license-admin-key';

const body = { email };
if (newPassword) body.newPassword = newPassword;

const res = await fetch(`${base}/admin/password`, {
  method: 'PUT',
  headers: {
    'content-type': 'application/json',
    'x-license-admin-key': adminKey,
  },
  body: JSON.stringify(body),
});
const json = await res.json();
if (!res.ok) {
  console.error(res.status, json);
  process.exit(1);
}

console.log('user:', json.user?.email);
console.log('temporaryPassword:', json.temporaryPassword);
console.log('\nEnvie no WhatsApp:');
console.log(
  `Sua nova senha do PouApp é: ${json.temporaryPassword}\nEntre no app e troque depois se quiser.`,
);
