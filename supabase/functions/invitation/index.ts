// POST /functions/v1/invitation
//   { action: 'info',   token }            → nombre y usuario de la cuenta a activar
//   { action: 'accept', token, password }  → el empleado define su contraseña
//
// El token viaja solo en el enlace; en la base de datos se guarda su SHA-256.
// El administrador nunca conoce la contraseña del empleado.

import { serve, json, HttpError } from '../_shared/http.ts';
import { adminClient, logActivity } from '../_shared/supabase.ts';
import { passwordProblem, sha256, TOKEN_RE } from '../_shared/security.ts';

const INVALID_LINK = 'Este enlace no es válido o ya expiró. Pide al administrador uno nuevo.';

serve(async (req, body) => {
  const action = body.action;
  const token = String(body.token ?? '');
  if (!TOKEN_RE.test(token)) throw new HttpError(400, INVALID_LINK, 'invalid_token');

  const admin = adminClient();
  const { data: invitation } = await admin
    .from('invitations')
    .select('id, employee_id, purpose, expires_at, used_at, employees!invitations_employee_id_fkey (id, full_name, username, status)')
    .eq('token_hash', await sha256(token))
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const employee = (invitation as any)?.employees as
    | { id: string; full_name: string; username: string; status: string }
    | undefined;

  if (!invitation || !employee || invitation.used_at || new Date(invitation.expires_at) < new Date()) {
    throw new HttpError(410, INVALID_LINK, 'invalid_token');
  }
  if (employee.status !== 'active') {
    throw new HttpError(403, 'Esta cuenta está desactivada. Contacta al administrador.', 'inactive');
  }

  if (action === 'info') {
    return json(req, {
      full_name: employee.full_name,
      username: employee.username,
      purpose: invitation.purpose,
      expires_at: invitation.expires_at,
    });
  }

  if (action !== 'accept') throw new HttpError(400, 'Acción inválida.');

  const password = String(body.password ?? '');
  const problem = passwordProblem(password, employee.username);
  if (problem) throw new HttpError(422, problem, 'weak_password');

  // Marcar el enlace como usado ANTES de cambiar la contraseña (un solo uso, sin carreras).
  const { data: claimed } = await admin
    .from('invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invitation.id)
    .is('used_at', null)
    .select('id');
  if (!claimed?.length) throw new HttpError(410, INVALID_LINK, 'invalid_token');

  const { error: updateError } = await admin.auth.admin.updateUserById(employee.id, { password });
  if (updateError) {
    // Devolver el enlace a su estado para que pueda reintentar.
    await admin.from('invitations').update({ used_at: null }).eq('id', invitation.id);
    const weak = /password/i.test(updateError.message);
    throw new HttpError(weak ? 422 : 500, weak ? 'La contraseña no cumple los requisitos de seguridad.' : 'No se pudo guardar la contraseña.');
  }

  await admin.from('employees').update({ password_set_at: new Date().toISOString() }).eq('id', employee.id);
  await admin.from('login_attempts').delete().eq('identifier', employee.username);
  await logActivity(admin, {
    actor_id: employee.id,
    action: invitation.purpose === 'reset' ? 'password_reset' : 'account_activated',
    entity_id: employee.id,
    subject_id: employee.id,
    description:
      invitation.purpose === 'reset'
        ? `${employee.full_name} restableció su contraseña.`
        : `${employee.full_name} activó su cuenta.`,
  });

  return json(req, { ok: true, username: employee.username });
});
