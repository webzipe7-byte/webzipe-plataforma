// POST /functions/v1/auth-login   { username, password }
//
// Inicio de sesión por nombre de usuario:
// 1. Bloqueo temporal tras varios intentos fallidos (por usuario).
// 2. Resuelve el correo interno del usuario en el servidor (no se expone).
// 3. Verifica la contraseña con Supabase Auth (bcrypt) y devuelve la sesión.
// 4. Registra el inicio de sesión en el historial.

import { serve, json, HttpError } from '../_shared/http.ts';
import { adminClient, publicClient, logActivity } from '../_shared/supabase.ts';
import { EMAIL_RE, USERNAME_RE } from '../_shared/security.ts';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const GENERIC_ERROR = 'Usuario o contraseña incorrectos.';

serve(async (req, body) => {
  const identifier = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!identifier || !password || identifier.length > 120 || password.length > 200) {
    throw new HttpError(400, 'Escribe tu usuario y tu contraseña.');
  }
  if (!USERNAME_RE.test(identifier) && !EMAIL_RE.test(identifier)) {
    throw new HttpError(401, GENERIC_ERROR);
  }

  const admin = adminClient();

  // 1. ¿Está bloqueado por intentos fallidos?
  const { data: attempt } = await admin
    .from('login_attempts')
    .select('failures, locked_until')
    .eq('identifier', identifier)
    .maybeSingle();

  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(attempt.locked_until).getTime() - Date.now()) / 60000);
    throw new HttpError(429, `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} min.`, 'locked');
  }

  const registerFailure = async () => {
    const failures = (attempt?.failures ?? 0) + 1;
    const locked = failures >= MAX_FAILURES;
    await admin.from('login_attempts').upsert({
      identifier,
      failures: locked ? 0 : failures,
      locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    // Pequeña espera constante para dificultar ataques de fuerza bruta y de enumeración.
    await new Promise((r) => setTimeout(r, 400));
  };

  // 2. Buscar al empleado por usuario (o correo)
  const column = identifier.includes('@') ? 'email' : 'username';
  const { data: employee } = await admin
    .from('employees')
    .select('id, full_name, role, status, password_set_at')
    .eq(column, identifier)
    .maybeSingle();

  if (!employee) {
    await registerFailure();
    throw new HttpError(401, GENERIC_ERROR);
  }

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(employee.id);
  if (authUserError || !authUser.user?.email) {
    await registerFailure();
    throw new HttpError(401, GENERIC_ERROR);
  }

  // 3. Verificar contraseña
  const { data: signIn, error: signInError } = await publicClient().auth.signInWithPassword({
    email: authUser.user.email,
    password,
  });

  if (signInError || !signIn.session) {
    await registerFailure();
    if (signInError && /banned/i.test(signInError.message)) {
      throw new HttpError(403, 'Tu cuenta está desactivada. Contacta al administrador.', 'inactive');
    }
    if (!employee.password_set_at) {
      throw new HttpError(401, 'Tu cuenta aún no está activada. Usa el enlace de activación que te envió el administrador.', 'not_activated');
    }
    throw new HttpError(401, GENERIC_ERROR);
  }

  // Contraseña correcta pero cuenta inactiva: no se entrega la sesión.
  if (employee.status !== 'active') {
    await admin.auth.admin.signOut(signIn.session.access_token).catch(() => {});
    throw new HttpError(403, 'Tu cuenta está desactivada. Contacta al administrador.', 'inactive');
  }

  // 4. Éxito
  const now = new Date().toISOString();
  await Promise.all([
    admin.from('login_attempts').delete().eq('identifier', identifier),
    admin.from('employees').update({ last_login_at: now, last_activity_at: now }).eq('id', employee.id),
    logActivity(admin, {
      actor_id: employee.id,
      action: 'login',
      entity_id: employee.id,
      subject_id: employee.id,
      description: `${employee.full_name} inició sesión.`,
    }),
  ]);

  return json(req, {
    session: {
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    },
    role: employee.role,
  });
});
