import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

type Change = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> };

/**
 * Escucha cambios en una tabla vía Supabase Realtime (respeta RLS).
 * `filter` usa la sintaxis de Realtime, p. ej. "employee_id=eq.<uuid>".
 */
export function useRealtime(table: string, onChange: (change: Change) => void, filter?: string, enabled = true) {
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`rt-${table}-${filter ?? 'all'}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload: Change) => handler.current(payload),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, enabled]);
}
