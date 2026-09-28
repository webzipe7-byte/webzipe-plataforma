// POST /functions/v1/admin-employees   (requiere sesión de admin o supervisor)
//   { action: 'create', employee: {...}, app_url }  → crea la cuenta y devuelve el enlace de activación
//   { action: 'update', id, employee: {...} }       → edita datos del empleado
//   { action: 'set_status', id, status, release_contacts? } → desactiva / reactiva
//   { action: 'invite', id, app_url }               → nuevo enlace (activación o restablecer contraseña)
//
// Reglas de permisos:
// - admin: puede todo, excepto cambiar su propio rol o desactivarse a sí mismo.
// - supervisor: solo gestiona cuentas con rol "employee" y no puede asignar otros roles.

import { serve, json, HttpError } from '../_shared/http.ts';
import { adminClient, requireCaller, logActivity, userClient, type Caller } from '../_shared/supabase.ts';
import { createInvitation, EMAIL_RE, randomToken, resolveAppUrl, USERNAME_RE } from '../_shared/security.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const ROLES = ['admin', 'supervisor', 'employee'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_LABEL: Record<string, string> = { admin: 'administrador', supervisor: 'supervisor', employee: 'empleado' };

type EmployeeInput = {
  full_name?: string;
  username?: string;
  email?: string;
  phone?: string | null;
  role?: string;
  hire_date?: string | null;
  notes?: string | null;
};

function clean(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) throw new HttpError(422, `Un campo supera el máximo de ${max} caracteres.`);
  return s;
}

function validate(input: EmployeeInput, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || input.full_name !== undefined) {
    const name = clean(input.full_name, 120);
    if (!name || name.length < 2) throw new HttpError(422, 'Escribe el nombre completo.');
    out.full_name = name;
  }
  if (!partial || input.username !== undefined) {
    const username = (clean(input.username, 30) ?? '').toLowerCase();
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(422, 'El usuario debe tener 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
    }
    out.username = username;
  }
  if (!partial || input.email !== undefined) {
    const email = (clean(input.email, 160) ?? '').toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(422, 'Escribe un correo válido.');
    out.email = email;
  }
  if (input.phone !== undefined) out.phone = clean(input.phone, 30);
  if (!partial || input.role !== undefined) {
    const role = input.role ?? 'employee';
    if (!ROLES.includes(role as (typeof ROLES)[number])) throw new HttpError(422, 'Rol inválido.');
    out.role = role;
  }
  if (input.hire_date !== undefined) {
    const d = clean(input.hire_date, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(422, 'Fecha de ingreso inválida.');
    out.hire_date = d;
  }
  return out;
}

async function loadTarget(admin: SupabaseClient, id: unknown) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new HttpError(400, 'Empleado inválido.');
  const { data } = await admin.from('employees').select('*').eq('id', id).maybeSingle();
  if (!data) throw new HttpError(404, 'Empleado no encontrado.');
  return data;
}

function assertCanManage(caller: Caller, target: { id: string; role: string }) {
  if (caller.role === 'admin') return;
  if (target.role !== 'employee') {
    throw new HttpError(403, 'Solo un administrador puede gestionar cuentas de administradores o supervisores.');
  }
}

async function assertUnique(admin: SupabaseClient, fields: Record<string, unknown>, exceptId?: string) {
  for (const key of ['username', 'email'] as const) {
    if (!fields[key]) continue;
    let q = admin.from('employees').select('id').eq(key, fields[key] as string);
    if (exceptId) q = q.neq('id', exceptId);
    const { data } = await q.maybeSingle();
    if (data) throw new HttpError(409, key === 'username' ? 'Ese usuario ya existe.' : 'Ese correo ya está registrado.');
  }
}

async function saveNotes(admin: SupabaseClient, employeeId: string, notes: unknown, by: string) {
  if (notes === undefined) return;
  const value = clean(notes, 4000) ?? '';
  await admin.from('employee_notes').upsert({ employee_id: employeeId, notes: value, updated_by: by, updated_at: new Date().toISOString() });
}

serve(async (req, body) => {
  const admin = adminClient();
  const caller = await requireCaller(req, admin);
  if (caller.role !== 'admin' && caller.role !== 'supervisor') {
    throw new HttpError(403, 'No tienes permiso para administrar empleados.');
  }

  switch (body.action) {
    // ---------------------------------------------------------------
    case 'create': {
      const input = (body.employee ?? {}) as EmployeeInput;
      const fields = validate(input, false);
      if (caller.role !== 'admin' && fields.role !== 'employee') {
        throw new HttpError(403, 'Un supervisor solo puede crear cuentas con rol empleado.');
      }
      await assertUnique(admin, fields);

      // Contraseña aleatoria que nadie conoce: el empleado definirá la suya con el enlace.
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: fields.email as string,
        password: `${randomToken(24)}Aa1`,
        email_confirm: true,
        app_metadata: { webzipe_role: fields.role },
      });
      if (createError || !created.user) {
        const exists = createError && /already|registered|exists/i.test(createError.message);
        throw new HttpError(exists ? 409 : 500, exists ? 'Ese correo ya tiene una cuenta.' : 'No se pudo crear la cuenta.');
      }

      const { data: employee, error: insertError } = await admin
        .from('employees')
        .insert({ ...fields, id: created.user.id, status: 'active', created_by: caller.id })
        .select('*')
        .single();
      if (insertError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw new HttpError(insertError.code === '23505' ? 409 : 500, insertError.code === '23505' ? 'Usuario o correo duplicado.' : 'No se pudo guardar el empleado.');
      }

      await saveNotes(admin, employee.id, input.notes, caller.id);
      const invite = await createInvitation(admin, employee.id, caller.id, 'activation', resolveAppUrl(req, body.app_url));
      await logActivity(admin, {
        actor_id: caller.id,
        action: 'employee_created',
        entity_id: employee.id,
        subject_id: employee.id,
        description: `${caller.full_name} creó la cuenta de ${employee.full_name} (${ROLE_LABEL[employee.role]}).`,
      });
      return json(req, { employee, invite_url: invite.url, expires_at: invite.expiresAt }, 201);
    }

    // ---------------------------------------------------------------
    case 'update': {
      const target = await loadTarget(admin, body.id);
      assertCanManage(caller, target);
      const input = (body.employee ?? {}) as EmployeeInput;
      const fields = validate(input, true);

      if (fields.role !== undefined && fields.role !== target.role) {
        if (caller.role !== 'admin') throw new HttpError(403, 'Solo un administrador puede cambiar roles.');
        if (target.id === caller.id) throw new HttpError(403, 'No puedes cambiar tu propio rol.');
      }
      await assertUnique(admin, fields, target.id);

      if (fields.email && fields.email !== target.email) {
        const { error } = await admin.auth.admin.updateUserById(target.id, { email: fields.email as string, email_confirm: true });
        if (error) throw new HttpError(409, 'No se pudo cambiar el correo (¿ya está en uso?).');
      }
      if (fields.role && fields.role !== target.role) {
        await admin.auth.admin.updateUserById(target.id, { app_metadata: { webzipe_role: fields.role } });
      }

      const { data: employee, error } = await admin.from('employees').update(fields).eq('id', target.id).select('*').single();
      if (error) throw new HttpError(500, 'No se pudo actualizar el empleado.');
      await saveNotes(admin, target.id, input.notes, caller.id);

      await logActivity(admin, {
        actor_id: caller.id,
        action: 'employee_updated',
        entity_id: target.id,
        subject_id: target.id,
        description:
          fields.role && fields.role !== target.role
            ? `${caller.full_name} cambió el rol de ${employee.full_name} a ${ROLE_LABEL[employee.role]}.`
            : `${caller.full_name} actualizó los datos de ${employee.full_name}.`,
      });
      return json(req, { employee });
    }

    // ---------------------------------------------------------------
    case 'set_status': {
      const target = await loadTarget(admin, body.id);
      assertCanManage(caller, target);
      const status = body.status;
      if (status !== 'active' && status !== 'inactive') throw new HttpError(400, 'Estado inválido.');
      if (target.id === caller.id) throw new HttpError(403, 'No puedes cambiar el estado de tu propia cuenta.');

      if (status === 'inactive' && target.role === 'admin') {
        const { count } = await admin.from('employees').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('status', 'active');
        if ((count ?? 0) <= 1) throw new HttpError(409, 'Debe quedar al menos un administrador activo.');
      }

      // Bloquea / desbloquea el inicio de sesión en Supabase Auth.
      const { error: banError } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: status === 'inactive' ? '876000h' : 'none',
      });
      if (banError) throw new HttpError(500, 'No se pudo cambiar el acceso de la cuenta.');

      const { data: employee } = await admin.from('employees').update({ status }).eq('id', target.id).select('*').single();

      let released = 0;
      if (status === 'inactive' && body.release_contacts === true) {
        // Se liberan con la sesión del administrador para que el historial registre quién lo hizo.
        const asCaller = userClient(req);
        const { data: contacts } = await admin.from('contacts').select('id').eq('assigned_to', target.id);
        for (const c of contacts ?? []) {
          const { error } = await asCaller.rpc('release_contact', { p_contact_id: c.id, p_reason: 'Empleado desactivado' });
          if (!error) released++;
        }
      }
      if (status === 'inactive') {
        await admin.from('invitations').update({ used_at: new Date().toISOString() }).eq('employee_id', target.id).is('used_at', null);
      }

      await logActivity(admin, {
        actor_id: caller.id,
        action: status === 'inactive' ? 'employee_deactivated' : 'employee_reactivated',
        entity_id: target.id,
        subject_id: target.id,
        description:
          status === 'inactive'
            ? `${caller.full_name} desactivó a ${target.full_name}${released ? ` y liberó ${released} contactos` : ''}.`
            : `${caller.full_name} reactivó a ${target.full_name}.`,
      });
      return json(req, { employee, released });
    }

    // ---------------------------------------------------------------
    case 'invite': {
      const target = await loadTarget(admin, body.id);
      assertCanManage(caller, target);
      if (target.status !== 'active') throw new HttpError(409, 'Reactiva la cuenta antes de generar un enlace.');
      const purpose = target.password_set_at ? 'reset' : 'activation';
      const invite = await createInvitation(admin, target.id, caller.id, purpose, resolveAppUrl(req, body.app_url));
      await logActivity(admin, {
        actor_id: caller.id,
        action: 'invitation_created',
        entity_id: target.id,
        subject_id: target.id,
        description:
          purpose === 'reset'
            ? `${caller.full_name} generó un enlace para restablecer la contraseña de ${target.full_name}.`
            : `${caller.full_name} generó un nuevo enlace de activación para ${target.full_name}.`,
      });
      return json(req, { invite_url: invite.url, expires_at: invite.expiresAt, purpose });
    }

    default:
      throw new HttpError(400, 'Acción inválida.');
  }
});
