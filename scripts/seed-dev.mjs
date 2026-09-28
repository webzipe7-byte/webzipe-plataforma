// DATOS DE DESARROLLO — nunca ejecutar en producción.
//
//   npm run seed:dev            crea cuentas y datos de prueba marcados como (DEV)
//   npm run seed:dev -- --clean elimina todo lo creado por este script
//
// No hay contraseñas en el código: el script imprime enlaces de activación
// para que definas las contraseñas de prueba al abrirlos.
// Los números usan el prefijo 555 (no asignado en Colombia) para no escribirle a nadie real.

import { adminClient, createInvitation, ensureEmployee } from './_admin-client.mjs';

const admin = adminClient();
const domain = process.env.DEV_EMAIL_DOMAIN || 'example.com';

const DEV_USERS = [
  { full_name: 'Admin WebZipe (DEV)', username: 'admin.dev', role: 'admin' },
  { full_name: 'Supervisor Demo (DEV)', username: 'supervisor.dev', role: 'supervisor' },
  { full_name: 'Empleado Demo (DEV)', username: 'empleado.dev', role: 'employee' },
  { full_name: 'Empleada Demo 2 (DEV)', username: 'empleada2.dev', role: 'employee' },
];

if (process.argv.includes('--clean')) {
  const { data: contacts } = await admin.from('contacts').delete().like('business', '[DEV]%').select('id');
  const { data: anns } = await admin.from('announcements').delete().like('title', '[DEV]%').select('id');
  for (const u of DEV_USERS) {
    const { data } = await admin.from('employees').select('id').eq('username', u.username).maybeSingle();
    if (data) await admin.auth.admin.deleteUser(data.id); // borra en cascada perfil, tareas, lecturas…
  }
  console.log(`Datos DEV eliminados (${contacts?.length ?? 0} contactos, ${anns?.length ?? 0} actualizaciones, cuentas *.dev).`);
  process.exit(0);
}

const ids = {};
console.log('\nCuentas de desarrollo (abre cada enlace para definir su contraseña):\n');
for (const u of DEV_USERS) {
  const { id, created } = await ensureEmployee(admin, { ...u, email: `${u.username.replace('.', '-')}@${domain}` });
  ids[u.username] = id;
  const link = await createInvitation(admin, id, created ? 'activation' : 'reset');
  console.log(`  ${u.full_name.padEnd(26)} @${u.username.padEnd(15)} ${link}`);
}

const employee = ids['empleado.dev'];
const employee2 = ids['empleada2.dev'];
const creator = ids['admin.dev'];

const contacts = [
  { name: 'Laura Gómez', business: '[DEV] Café Aroma', category: 'Cafetería', phone: '5550100001', city: 'Pasto', assigned_to: employee },
  { name: 'Carlos Ruiz', business: '[DEV] Barbería Norte', category: 'Barbería', phone: '5550100002', city: 'Pasto', assigned_to: employee, status: 'interesado' },
  { name: 'Marta Díaz', business: '[DEV] Tienda Sol', category: 'Tienda', phone: '5550100003', city: 'Ipiales', assigned_to: employee2 },
  { name: null, business: '[DEV] Abogados & Asociados', category: 'Abogado', phone: '5550100004', city: 'Cali', assigned_to: null },
];

for (const c of contacts) {
  const { data: exists } = await admin.from('contacts').select('id').eq('phone', `57${c.phone}`).maybeSingle();
  if (!exists) {
    const { error } = await admin.from('contacts').insert({ ...c, created_by: creator, notes: 'Dato de desarrollo' });
    if (error) console.error('Contacto:', error.message);
  }
}

const { data: laura } = await admin.from('contacts').select('id').eq('phone', '575550100001').maybeSingle();
const { data: existingTask } = await admin.from('tasks').select('id').eq('assigned_to', employee).like('title', '[DEV]%').limit(1);
if (!existingTask?.length) {
  await admin.from('tasks').insert([
    { title: '[DEV] Enviar propuesta de página web', description: 'Compartir el ejemplo de cafetería y la propuesta.', contact_id: laura?.id, assigned_to: employee, created_by: creator, priority: 'alta', due_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) },
    { title: '[DEV] Hacer seguimiento a Barbería Norte', assigned_to: employee, created_by: creator, priority: 'media' },
  ]);
}

const { data: existingAnn } = await admin.from('announcements').select('id').like('title', '[DEV]%').limit(1);
if (!existingAnn?.length) {
  await admin.from('announcements').insert({
    title: '[DEV] Bienvenido a la plataforma',
    body: 'Esta es una actualización de prueba. Revisa tus tareas y contactos asignados.',
    category: 'instrucciones',
    author_id: creator,
  });
}

console.log('\nDatos DEV listos. Para eliminarlos: npm run seed:dev -- --clean\n');
