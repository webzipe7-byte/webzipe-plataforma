// Variables públicas del frontend (definidas en .env.local o en GitHub Actions).
// Aquí NO debe existir ninguna clave secreta.

export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  webzipeSiteUrl: (import.meta.env.VITE_WEBZIPE_SITE_URL || 'https://webzipe7-byte.github.io/WebZipe/').trim(),
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** URL base de esta plataforma (para enlaces de activación). */
export function appBaseUrl(): string {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/index\.html$/, '');
}
