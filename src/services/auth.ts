import { supabase } from '../lib/supabase';
import type { Employee, Role } from '../types/database';
import { AppError, unwrap } from '../utils/errors';
import { callFunction } from './functions';

export async function signInWithUsername(username: string, password: string): Promise<Role> {
  const res = await callFunction<{ session: { access_token: string; refresh_token: string }; role: Role }>(
    'auth-login',
    { username: username.trim().toLowerCase(), password },
    false,
  );
  const { error } = await supabase.auth.setSession(res.session);
  if (error) throw new AppError('No se pudo iniciar la sesión. Intenta de nuevo.');
  return res.role;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function fetchOwnProfile(userId: string): Promise<Employee | null> {
  return unwrap(await supabase.from('employees').select('*').eq('id', userId).maybeSingle()) as Employee | null;
}

export function getInvitationInfo(token: string) {
  return callFunction<{ full_name: string; username: string; purpose: 'activation' | 'reset'; expires_at: string }>(
    'invitation',
    { action: 'info', token },
    false,
  );
}

export function acceptInvitation(token: string, password: string) {
  return callFunction<{ ok: true; username: string }>('invitation', { action: 'accept', token, password }, false);
}

/** Validación de contraseña en el cliente (la definitiva ocurre en el servidor). */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < 10) return 'Usa al menos 10 caracteres.';
  if (password.length > 72) return 'Máximo 72 caracteres.';
  if (!/[a-zA-ZÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'Incluye letras y números.';
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'No incluyas tu usuario en la contraseña.';
  return null;
}

export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  let score = 0;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)) score++;
  if (password.length >= 14 || /[^a-zA-Z0-9]/.test(password)) score++;
  return score as 0 | 1 | 2 | 3;
}
