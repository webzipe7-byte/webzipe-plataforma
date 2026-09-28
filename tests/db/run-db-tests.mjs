// Pruebas de seguridad y lógica de la base de datos.
// Ejecuta las migraciones reales sobre un Postgres embebido (PGlite) y
// comprueba RLS, roles, RPCs y triggers actuando como distintos usuarios.
//
//   npm run test:db

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'supabase', 'migrations');

const db = new PGlite();
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  } finally {
    await db.exec('reset role;');
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function as(uid, role = 'authenticated') {
  await db.exec('reset role;');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`set role ${role};`);
}

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function one(sql, params = []) {
  return (await rows(sql, params))[0];
}

async function fails(sql, params = [], pattern) {
  try {
    await db.query(sql, params);
  } catch (err) {
    if (pattern && !pattern.test(err.message)) throw new Error(`Falló con un error inesperado: ${err.message}`);
    return err.message;
  }
  throw new Error(`Se esperaba un error y no ocurrió: ${sql}`);
}

// ---------------------------------------------------------------------
console.log('\nPreparando base de datos…');
await db.exec(readFileSync(join(here, 'supabase-shim.sql'), 'utf8'));
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  } catch (err) {
    console.error(`
Error en la migración ${file}: ${err.message}${err.position ? ` (posición ${err.position})` : ''}`);
    process.exit(1);
  }
  console.log(`  migración aplicada: ${file}`);
}

// Usuarios de prueba (lo que haría la Edge Function admin-employees con service role)
const ADMIN = '00000000-0000-0000-0000-00000000000a';
const SUPER = '00000000-0000-0000-0000-00000000000b';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const BETO = '00000000-0000-0000-0000-0000000000b1';
const people = [
  [ADMIN, 'Admin WebZipe (DEV)', 'admin.dev', 'admin'],
  [SUPER, 'Sofía Supervisora (DEV)', 'sofia.dev', 'supervisor'],
  [ANA, 'Ana Empleada (DEV)', 'ana.dev', 'employee'],
  [BETO, 'Beto Empleado (DEV)', 'beto.dev', 'employee'],
];
for (const [id, name, username, role] of people) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${username}@example.dev`]);
  await db.query(
    `insert into public.employees (id, full_name, username, email, role, password_set_at) values ($1, $2, $3, $4, $5, now())`,
    [id, name, username, `${username}@example.dev`, role],
  );
}

let contactAna;
let contactFree;
let taskAna;
let taskBeto;

console.log('\nAdministración (rol admin)');

await test('el admin crea contactos y el número se normaliza (+57)', async () => {
  await as(ADMIN);
  const c = await one(
    `insert into public.contacts (name, business, phone, city) values ('Laura', 'Café Aroma', '300 123 4567', 'Pasto') returning id, phone`,
  );
  assert(c.phone === '573001234567', `teléfono normalizado inesperado: ${c.phone}`);
  contactAna = c.id;
  const f = await one(`insert into public.contacts (business, phone) values ('Barbería Norte', '+57 310-555-0000') returning id, phone`);
  assert(f.phone === '573105550000', `teléfono normalizado inesperado: ${f.phone}`);
  contactFree = f.id;
});

await test('no se puede registrar el mismo número dos veces (aunque se escriba distinto)', async () => {
  await as(ADMIN);
  await fails(`insert into public.contacts (business, phone) values ('Duplicado', '(300) 123-4567')`, [], /duplicate|unique/i);
});

await test('asignar contacto crea historial y registro de actividad', async () => {
  await as(ADMIN);
  const r = await one(`select public.assign_contact($1, $2) as r`, [contactAna, ANA]);
  assert(r.r.ok === true, JSON.stringify(r.r));
  const a = await rows(`select * from public.assignments where contact_id = $1 and released_at is null`, [contactAna]);
  assert(a.length === 1 && a[0].employee_id === ANA, 'debe existir 1 asignación activa para Ana');
  const log = await one(`select description from public.activity_logs where action = 'contact_assigned' order by id desc limit 1`);
  assert(/Admin WebZipe \(DEV\) asignó el contacto 3001234567 a Ana Empleada/.test(log.description), log.description);
});

await test('asignar un número ya asignado devuelve advertencia y no lo cambia', async () => {
  await as(ADMIN);
  const r = await one(`select public.assign_contact($1, $2) as r`, [contactAna, BETO]);
  assert(r.r.ok === false && r.r.code === 'already_assigned', JSON.stringify(r.r));
  assert(r.r.assigned_to_name === 'Ana Empleada (DEV)', 'debe informar a quién está asignado');
  const c = await one(`select assigned_to from public.contacts where id = $1`, [contactAna]);
  assert(c.assigned_to === ANA, 'el contacto no debió cambiar de dueño');
});

await test('reasignar con confirmación (force) libera la asignación anterior', async () => {
  await as(ADMIN);
  await one(`select public.assign_contact($1, $2, true, 'Prueba de reasignación') as r`, [contactAna, BETO]);
  const active = await rows(`select employee_id from public.assignments where contact_id = $1 and released_at is null`, [contactAna]);
  assert(active.length === 1 && active[0].employee_id === BETO, 'solo Beto debe tener la asignación activa');
  const released = await one(`select release_reason from public.assignments where contact_id = $1 and employee_id = $2`, [contactAna, ANA]);
  assert(released.release_reason === 'Prueba de reasignación', `motivo: ${released.release_reason}`);
  // devolver a Ana para el resto de pruebas
  await one(`select public.assign_contact($1, $2, true) as r`, [contactAna, ANA]);
});

await test('el admin crea tareas; el teléfono y el cliente se copian del contacto', async () => {
  await as(ADMIN);
  const t = await one(
    `insert into public.tasks (title, contact_id, assigned_to, priority, due_date) values ('Enviar propuesta', $1, $2, 'alta', current_date + 2) returning *`,
    [contactAna, ANA],
  );
  assert(t.phone === '573001234567' && t.client_name === 'Laura · Café Aroma', `${t.phone} / ${t.client_name}`);
  assert(t.created_by === ADMIN, 'created_by debe ser el admin');
  taskAna = t.id;
  const t2 = await one(`insert into public.tasks (title, assigned_to) values ('Tarea de Beto', $1) returning id`, [BETO]);
  taskBeto = t2.id;
});

await test('el admin publica una actualización y envía un mensaje a Ana', async () => {
  await as(ADMIN);
  const a = await one(`insert into public.announcements (title, body, category) values ('Nuevo guion', 'Usar el nuevo guion', 'instrucciones') returning author_name`);
  assert(a.author_name === 'Admin WebZipe (DEV)', a.author_name);
  const m = await one(`select public.send_message('Hola Ana', 'Revisa tus tareas', 'employee', null, $1) as r`, [ANA]);
  assert(m.r.recipients === 1, JSON.stringify(m.r));
});

console.log('\nAislamiento entre empleados');

await test('un empleado solo ve su propia fila de empleados', async () => {
  await as(ANA);
  const r = await rows(`select id from public.employees`);
  assert(r.length === 1 && r[0].id === ANA, `ve ${r.length} empleados`);
});

await test('un empleado solo ve sus tareas', async () => {
  await as(ANA);
  const r = await rows(`select id from public.tasks`);
  assert(r.length === 1 && r[0].id === taskAna, `ve ${r.length} tareas`);
  await as(BETO);
  const r2 = await rows(`select id from public.tasks where id = $1`, [taskAna]);
  assert(r2.length === 0, 'Beto no debe ver la tarea de Ana');
});

await test('un empleado solo ve sus contactos (no los libres ni los de otros)', async () => {
  await as(ANA);
  const r = await rows(`select id from public.contacts`);
  assert(r.length === 1 && r[0].id === contactAna, `ve ${r.length} contactos`);
  await as(BETO);
  const r2 = await rows(`select id from public.contacts`);
  assert(r2.length === 0, `Beto ve ${r2.length} contactos`);
});

await test('un empleado no ve los mensajes de otro', async () => {
  await as(BETO);
  assert((await rows(`select id from public.messages`)).length === 0, 'Beto no debe ver mensajes');
  await as(ANA);
  const s = await one(`select public.get_my_summary() as s`);
  assert(s.s.unread_messages === 1, JSON.stringify(s.s));
});

await test('un empleado no ve el historial de actividad de otros', async () => {
  await as(BETO);
  const r = await rows(`select description from public.activity_logs`);
  assert(r.every((x) => !/Ana Empleada/.test(x.description) || /Beto/.test(x.description)), 'Beto ve actividad de Ana');
});

await test('un empleado no puede leer notas internas, invitaciones ni intentos de login', async () => {
  await as(ANA);
  await fails(`select * from public.invitations`, [], /permission denied/);
  await fails(`select * from public.login_attempts`, [], /permission denied/);
  assert((await rows(`select * from public.employee_notes`)).length === 0, 'no debe ver notas');
});

console.log('\nEscalamiento de privilegios bloqueado');

await test('un empleado no puede cambiarse el rol ni editar empleados', async () => {
  await as(ANA);
  await fails(`update public.employees set role = 'admin' where id = $1`, [ANA], /permission denied/);
  await fails(`insert into public.employees (id, full_name, username, email) values (gen_random_uuid(), 'X', 'xxx', 'x@x.co')`, [], /permission denied/);
});

await test('un empleado no puede crear/editar tareas ni contactos directamente', async () => {
  await as(ANA);
  await fails(`insert into public.tasks (title, assigned_to) values ('hack', $1)`, [ANA], /row-level security/);
  const u = await db.query(`update public.tasks set title = 'hack' where id = $1`, [taskAna]);
  assert(u.affectedRows === 0, 'no debe poder editar la tarea directamente');
  const c = await db.query(`update public.contacts set assigned_to = $2 where id = $1`, [contactAna, BETO]);
  assert(c.affectedRows === 0, 'no debe poder reasignar contactos');
  await fails(`insert into public.contacts (phone) values ('3009998888')`, [], /row-level security/);
});

await test('un empleado no puede insertar registros de actividad falsos', async () => {
  await as(ANA);
  await fails(`insert into public.activity_logs (action, description) values ('x', 'falso')`, [], /permission denied/);
});

await test('un empleado no puede usar funciones de administración', async () => {
  await as(ANA);
  await fails(`select public.admin_dashboard_stats()`, [], /No autorizado/);
  await fails(`select * from public.employee_workload()`, [], /No autorizado/);
  await fails(`select public.assign_contact($1, $2, true)`, [contactFree, ANA], /No autorizado/);
  await fails(`select public.release_contact($1)`, [contactAna], /No autorizado/);
  await fails(`select public.send_message('x', 'y', 'all')`, [], /No autorizado/);
  await fails(`select public.import_contacts('[]'::jsonb)`, [], /No autorizado/);
});

await test('un empleado no puede llamar funciones internas (esquema private)', async () => {
  await as(ANA);
  await fails(`select private.log(null, 'x', null, null, null, 'falso')`, [], /permission denied/);
});

await test('un empleado no puede cambiar la configuración', async () => {
  await as(ANA);
  const r = await db.query(`update public.settings set value = 'false' where key = 'allow_employee_contacts'`);
  assert(r.affectedRows === 0, 'no debe modificar settings');
});

await test('un supervisor no puede cambiar la configuración (solo admin)', async () => {
  await as(SUPER);
  const r = await db.query(`update public.settings set value = 'false' where key = 'allow_employee_contacts'`);
  assert(r.affectedRows === 0, 'el supervisor no debe modificar settings');
  await as(ADMIN);
  const r2 = await db.query(`update public.settings set value = 'true' where key = 'allow_employee_contacts'`);
  assert(r2.affectedRows === 1, 'el admin sí debe poder');
});

await test('un supervisor puede ver empleados y asignar tareas', async () => {
  await as(SUPER);
  assert((await rows(`select id from public.employees`)).length === 4, 'debe ver a todos');
  await one(`insert into public.tasks (title, assigned_to) values ('Tarea del supervisor', $1) returning id`, [BETO]);
});

console.log('\nFlujos del empleado');

await test('el empleado actualiza el estado de su tarea y el admin lo ve completado', async () => {
  await as(ANA);
  await db.query(`select public.update_task_status($1, 'en_proceso')`, [taskAna]);
  await db.query(`select public.update_task_status($1, 'completada', 'Propuesta enviada')`, [taskAna]);
  await as(ADMIN);
  const t = await one(`select status, completed_at, started_at, employee_note from public.tasks where id = $1`, [taskAna]);
  assert(t.status === 'completada' && t.completed_at && t.started_at, JSON.stringify(t));
  const log = await one(`select description from public.activity_logs where action = 'task_completed' order by id desc limit 1`);
  assert(log.description === 'Ana Empleada (DEV) marcó la tarea «Enviar propuesta» como completada.', log.description);
});

await test('el empleado no puede cambiar el estado de una tarea ajena', async () => {
  await as(ANA);
  await fails(`select public.update_task_status($1, 'completada')`, [taskBeto], /no asignada a ti/);
});

await test('el empleado actualiza su contacto; no puede tocar contactos ajenos', async () => {
  await as(ANA);
  await db.query(`select public.update_my_contact($1, 'interesado', 'Quiere catálogo')`, [contactAna]);
  await fails(`select public.update_my_contact($1, 'cliente')`, [contactFree], /no asignado a ti/);
  const c = await one(`select status, notes, last_contacted_at from public.contacts where id = $1`, [contactAna]);
  assert(c.status === 'interesado' && c.notes === 'Quiere catálogo' && c.last_contacted_at, JSON.stringify(c));
});

await test('verificar un número ajeno avisa "taken" sin revelar el dueño y queda registrado', async () => {
  await as(BETO);
  const r = await one(`select public.check_phone('3001234567') as r`);
  assert(r.r.status === 'taken' && r.r.assigned_to_name == null, JSON.stringify(r.r));
  await as(ADMIN);
  const log = await one(`select description from public.activity_logs where action = 'number_conflict' order by id desc limit 1`);
  assert(/Beto Empleado \(DEV\) intentó usar el número 3001234567/.test(log.description), log.description);
});

await test('el admin sí ve a quién pertenece un número', async () => {
  await as(ADMIN);
  const r = await one(`select public.check_phone('573001234567') as r`);
  assert(r.r.status === 'taken' && r.r.assigned_to_name === 'Ana Empleada (DEV)', JSON.stringify(r.r));
});

await test('el empleado registra un número nuevo; no puede registrar uno existente', async () => {
  await as(BETO);
  const ok = await one(`select public.claim_new_contact('{"business":"Tienda Sol","phone":"3207778899"}'::jsonb) as r`);
  assert(ok.r.ok === true, JSON.stringify(ok.r));
  const dup = await one(`select public.claim_new_contact('{"business":"Otro","phone":"300-123-4567"}'::jsonb) as r`);
  assert(dup.r.ok === false && dup.r.code === 'taken', JSON.stringify(dup.r));
  const unassigned = await one(`select public.claim_new_contact('{"business":"Otro","phone":"3105550000"}'::jsonb) as r`);
  assert(unassigned.r.ok === false && unassigned.r.code === 'unassigned', JSON.stringify(unassigned.r));
});

await test('mensajes y actualizaciones se marcan leídos / no leídos', async () => {
  await as(ANA);
  const m = await one(`select message_id from public.message_recipients where employee_id = $1`, [ANA]);
  await db.query(`select public.mark_message_read($1, true)`, [m.message_id]);
  let s = (await one(`select public.get_my_summary() as s`)).s;
  assert(s.unread_messages === 0 && s.unread_announcements === 1, JSON.stringify(s));
  const a = await one(`select id from public.announcements limit 1`);
  await db.query(`select public.set_announcement_read($1, true)`, [a.id]);
  s = (await one(`select public.get_my_summary() as s`)).s;
  assert(s.unread_announcements === 0, JSON.stringify(s));
  await db.query(`select public.set_announcement_read($1, false)`, [a.id]);
  s = (await one(`select public.get_my_summary() as s`)).s;
  assert(s.unread_announcements === 1, 'debe volver a no leída');
});

console.log('\nAcceso anónimo y cuentas inactivas');

await test('un visitante sin sesión no puede leer nada', async () => {
  await as(null, 'anon');
  for (const t of ['employees', 'tasks', 'contacts', 'messages', 'announcements', 'activity_logs', 'settings', 'assignments']) {
    await fails(`select * from public.${t}`, [], /permission denied/);
  }
  await fails(`select public.get_my_summary()`, [], /permission denied/);
});

await test('una sesión autenticada sin perfil de empleado no ve nada', async () => {
  await as('00000000-0000-0000-0000-0000000000ff');
  assert((await rows(`select * from public.announcements`)).length === 0, 've anuncios');
  assert((await rows(`select * from public.employees`)).length === 0, 've empleados');
  await fails(`select public.get_my_summary()`, [], /No autorizado/);
});

await test('un empleado desactivado pierde acceso inmediatamente', async () => {
  await db.query(`update public.employees set status = 'inactive' where id = $1`, [ANA]);
  await as(ANA);
  assert((await rows(`select * from public.tasks`)).length === 0, 've tareas');
  assert((await rows(`select * from public.contacts`)).length === 0, 've contactos');
  await fails(`select public.get_my_summary()`, [], /No autorizado/);
  await as(ADMIN);
  await fails(`select public.assign_contact($1, $2, true)`, [contactFree, ANA], /inactivo/);
  await db.exec('reset role;');
  await db.query(`update public.employees set status = 'active' where id = $1`, [ANA]);
});

console.log('\nPanel administrativo');

await test('estadísticas y carga de trabajo', async () => {
  await as(ADMIN);
  const s = (await one(`select public.admin_dashboard_stats() as s`)).s;
  assert(s.employees_active === 4 && s.tasks_completada === 1 && s.contacts_total === 3 && s.contacts_interesados === 1, JSON.stringify(s));
  const w = await rows(`select * from public.employee_workload()`);
  const ana = w.find((x) => x.employee_id === ANA);
  assert(Number(ana.tasks_completed) === 1 && Number(ana.contacts_total) === 1, JSON.stringify(ana));
});

await test('importación masiva detecta duplicados e inválidos', async () => {
  await as(ADMIN);
  const r = (await one(
    `select public.import_contacts($1::jsonb, $2) as r`,
    [JSON.stringify([{ phone: '3011112222', business: 'A' }, { phone: '3001234567' }, { phone: '12' }, { phone: '3011113333', business: 'B' }]), BETO],
  )).r;
  assert(r.inserted === 2 && r.duplicates.length === 1 && r.invalid.length === 1, JSON.stringify(r));
  const hist = await rows(`select * from public.assignments where employee_id = $1 and released_at is null`, [BETO]);
  assert(hist.length === 3, `Beto debería tener 3 asignaciones activas, tiene ${hist.length}`);
});

await test('liberar un número deja el contacto sin responsable', async () => {
  await as(ADMIN);
  await db.query(`select public.release_contact($1, 'Empleado de vacaciones')`, [contactAna]);
  const c = await one(`select assigned_to, assigned_at from public.contacts where id = $1`, [contactAna]);
  assert(c.assigned_to === null && c.assigned_at === null, JSON.stringify(c));
  const active = await rows(`select * from public.assignments where contact_id = $1 and released_at is null`, [contactAna]);
  assert(active.length === 0, 'no debe quedar asignación activa');
});

console.log(`\n${passed} pruebas correctas, ${failed} con error\n`);
process.exit(failed ? 1 : 0);
