/** Error con un mensaje apto para mostrar al usuario. */
export class AppError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
    this.name = 'AppError';
  }
}

type SupabaseLikeError = { message?: string; code?: string; details?: string | null; hint?: string | null };

/** Traduce errores de Supabase/Postgres a mensajes claros en español. */
export function friendlyError(err: unknown): string {
  if (!err) return 'Ocurrió un error inesperado.';
  if (err instanceof AppError) return err.message;
  const e = err as SupabaseLikeError;
  const msg = e.message ?? String(err);

  if (e.code === '23505' || /duplicate key/i.test(msg)) {
    if (/phone/i.test(msg + (e.details ?? ''))) return 'Ese número ya está registrado en el sistema.';
    return 'Ya existe un registro con esos datos.';
  }
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return /No autorizado|no asignad/i.test(msg) ? msg : 'No tienes permiso para realizar esta acción.';
  }
  if (e.code === '23514' || /violates check constraint/i.test(msg)) return 'Algún dato no tiene un formato válido.';
  if (e.code === 'PGRST116') return 'No se encontró el registro.';
  if (/JWT|token/i.test(msg) && /expired|invalid/i.test(msg)) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sin conexión con el servidor. Revisa tu internet.';
  // Los mensajes lanzados por nuestras funciones SQL ya están en español.
  return msg;
}

/** Lanza si la respuesta de Supabase trae error; devuelve los datos. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw new AppError(friendlyError(res.error), (res.error as SupabaseLikeError).code);
  return res.data;
}
