// Tokens de invitación y validaciones compartidas.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { allowedOrigins } from './http.ts';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;

/** Devuelve un mensaje de error o null si la contraseña es aceptable. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (password.length > 72) return 'La contraseña no puede superar 72 caracteres.';
  if (!/[a-zA-ZÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'La contraseña debe incluir letras y números.';
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'La contraseña no puede contener tu usuario.';
  if (/^(.)\1+$/.test(password)) return 'La contraseña es demasiado simple.';
  return null;
}

/** Crea un enlace de activación/restablecimiento y anula los anteriores. */
export async function createInvitation(
  admin: SupabaseClient,
  employeeId: string,
  createdBy: string | null,
  purpose: 'activation' | 'reset',
  appUrl: string,
): Promise<{ url: string; expiresAt: string }> {
  const { data: setting } = await admin.from('settings').select('value').eq('key', 'invitation_hours').maybeSingle();
  const hours = Math.min(Math.max(Number(setting?.value ?? 72) || 72, 1), 24 * 14);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();

  await admin
    .from('invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('employee_id', employeeId)
    .is('used_at', null);

  const { error } = await admin.from('invitations').insert({
    employee_id: employeeId,
    token_hash: await sha256(token),
    purpose,
    expires_at: expiresAt,
    created_by: createdBy,
  });
  if (error) throw error;

  const base = appUrl.replace(/\/+$/, '');
  return { url: `${base}/#/activar?token=${token}`, expiresAt };
}

/**
 * URL pública de la plataforma para construir enlaces de activación.
 * Prioridad: APP_URL (recomendado en producción) → URL enviada por el
 * cliente si su origen está permitido → origen de la petición.
 */
export function resolveAppUrl(req: Request, clientUrl?: unknown): string {
  const configured = Deno.env.get('APP_URL');
  if (configured) return configured;
  if (typeof clientUrl === 'string') {
    try {
      const u = new URL(clientUrl);
      if (allowedOrigins().includes(u.origin)) return `${u.origin}${u.pathname}`;
    } catch {
      // se ignora y se usa el origen
    }
  }
  const origin = req.headers.get('Origin');
  if (origin && allowedOrigins().includes(origin)) return origin;
  throw new Error('Configura la variable APP_URL en las Edge Functions.');
}
