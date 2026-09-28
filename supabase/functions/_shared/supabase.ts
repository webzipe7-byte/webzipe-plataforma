// Clientes de Supabase para Edge Functions.
// La clave de service role solo existe aquí (servidor). Nunca en el frontend.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

function env(name: string, ...fallbacks: string[]): string {
  for (const key of [name, ...fallbacks]) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(`Falta la variable de entorno ${name}`);
}

const SUPABASE_URL = env('SUPABASE_URL');

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

/** Cliente con privilegios de servicio (omite RLS). Úsalo con cuidado. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY'), clientOptions);
}

/** Cliente público (misma clave que el frontend). */
export function publicClient(): SupabaseClient {
  return createClient(SUPABASE_URL, env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'ANON_KEY'), clientOptions);
}

/** Cliente que actúa como el usuario que llama (RLS y auditoría con su identidad). */
export function userClient(req: Request): SupabaseClient {
  return createClient(SUPABASE_URL, env('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'ANON_KEY'), {
    ...clientOptions,
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

export type Caller = {
  id: string;
  full_name: string;
  role: 'admin' | 'supervisor' | 'employee';
};

/** Verifica el JWT del usuario que llama y devuelve su perfil activo. */
export async function requireCaller(req: Request, admin: SupabaseClient): Promise<Caller> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sesión requerida.');

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesión inválida o expirada. Vuelve a iniciar sesión.');

  const { data: profile } = await admin
    .from('employees')
    .select('id, full_name, role, status')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || profile.status !== 'active') throw new HttpError(403, 'Tu cuenta no está activa.');
  return { id: profile.id, full_name: profile.full_name, role: profile.role };
}

export async function logActivity(
  admin: SupabaseClient,
  entry: {
    actor_id: string | null;
    action: string;
    description: string;
    entity_type?: string;
    entity_id?: string;
    subject_id?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from('activity_logs').insert({
    entity_type: 'employee',
    metadata: {},
    ...entry,
  });
  if (error) console.error('No se pudo registrar la actividad', error);
}
