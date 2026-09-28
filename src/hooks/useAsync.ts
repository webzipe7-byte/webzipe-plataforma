import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../utils/errors';

/**
 * Ejecuta una función asíncrona cuando cambian sus dependencias.
 * Ignora respuestas antiguas si llega una más reciente (evita parpadeos al filtrar).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const callId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(async (silent = false) => {
    const id = ++callId.current;
    if (!silent) setLoading(true);
    try {
      const result = await run();
      if (id === callId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === callId.current) setError(friendlyError(err));
    } finally {
      if (id === callId.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
