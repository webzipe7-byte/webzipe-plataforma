import { env } from '../config/env';
import { supabase } from '../lib/supabase';
import { AppError } from '../utils/errors';

/** Llama a una Edge Function de Supabase y devuelve el JSON, o lanza AppError con el mensaje del servidor. */
export async function callFunction<T>(name: string, body: Record<string, unknown>, withSession = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: env.supabaseAnonKey,
  };
  if (withSession) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${env.supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new AppError('Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // respuesta sin cuerpo JSON
  }
  if (!res.ok) {
    const p = (payload ?? {}) as { error?: string; code?: string; message?: string };
    const fallback =
      res.status === 404 ? 'El servicio no está disponible (¿se desplegaron las Edge Functions?).' : 'No se pudo completar la operación.';
    throw new AppError(p.error ?? p.message ?? fallback, p.code, res.status);
  }
  return payload as T;
}
