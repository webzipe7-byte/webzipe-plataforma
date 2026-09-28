import { createClient } from '@supabase/supabase-js';
import { env, isConfigured } from '../config/env';

// Cliente público: usa la clave "anon/publishable", que es pública por diseño.
// La seguridad real la imponen las políticas RLS y las funciones de la base de datos.
export const supabase = createClient(
  isConfigured ? env.supabaseUrl : 'https://no-configurado.supabase.co',
  isConfigured ? env.supabaseAnonKey : 'no-configurado',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'webzipe-plataforma-auth',
    },
  },
);
