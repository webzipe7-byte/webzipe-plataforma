// Crea el PRIMER administrador y muestra su enlace de activación.
//
//   npm run create-admin -- --name "Jonathan Pérez" --username jonathan --email tu@correo.com
//
// Requiere SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y APP_URL en .env.local.
// La contraseña NO se define aquí: la eliges tú al abrir el enlace.

import { adminClient, createInvitation, ensureEmployee } from './_admin-client.mjs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const full_name = arg('name');
const username = arg('username')?.toLowerCase();
const email = arg('email')?.toLowerCase();

if (!full_name || !username || !email) {
  console.log('Uso: npm run create-admin -- --name "Nombre Apellido" --username usuario --email correo@dominio.com');
  process.exit(1);
}
if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
  console.error('Usuario inválido: 3 a 30 caracteres (a-z, 0-9, punto, guion, guion bajo).');
  process.exit(1);
}

const admin = adminClient();
const { id, created } = await ensureEmployee(admin, { full_name, username, email, role: 'admin' });
if (!created) {
  await admin.from('employees').update({ role: 'admin', status: 'active' }).eq('id', id);
  await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
}
const link = await createInvitation(admin, id, created ? 'activation' : 'reset');
await admin.from('activity_logs').insert({
  actor_id: id,
  action: 'employee_created',
  entity_type: 'employee',
  entity_id: id,
  subject_id: id,
  description: `Se configuró la cuenta de administrador de ${full_name}.`,
});

console.log(`\n${created ? 'Administrador creado' : 'El usuario ya existía: se confirmó como administrador'}: ${full_name} (@${username})`);
console.log('\nAbre este enlace para definir tu contraseña (válido 72 horas, un solo uso):\n');
console.log(`  ${link}\n`);
