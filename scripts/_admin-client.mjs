// Utilidades para los scripts de administración (se ejecutan en TU computador,
// nunca en el navegador). Leen la clave de service role desde .env.local.

import { readFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.APP_URL || 'http://localhost:5173/';
  if (!url || !serviceKey) {
    console.error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }
  return { url, serviceKey, appUrl };
}

export function adminClient() {
  const { url, serviceKey } = loadEnv();
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createInvitation(admin, employeeId, purpose = 'activation') {
  const { appUrl } = loadEnv();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await admin.from('invitations').update({ used_at: new Date().toISOString() }).eq('employee_id', employeeId).is('used_at', null);
  const { error } = await admin.from('invitations').insert({
    employee_id: employeeId,
    token_hash: tokenHash,
    purpose,
    expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
  });
  if (error) throw error;
  return `${appUrl.replace(/\/+$/, '')}/#/activar?token=${token}`;
}

/** Crea (o reutiliza) una cuenta y su perfil. Devuelve { id, created }. */
export async function ensureEmployee(admin, { full_name, username, email, role, phone = null }) {
  const { data: existing } = await admin.from('employees').select('id').eq('username', username).maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `${randomBytes(24).toString('base64url')}Aa1`,
    email_confirm: true,
    app_metadata: { webzipe_role: role },
  });
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`);

  const { error: insertError } = await admin
    .from('employees')
    .insert({ id: data.user.id, full_name, username, email, role, phone, status: 'active' });
  if (insertError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`No se pudo guardar el perfil de ${username}: ${insertError.message}`);
  }
  return { id: data.user.id, created: true };
}
