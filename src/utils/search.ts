import { digitsOnly } from './phone';

/**
 * Construye un filtro `or` seguro para PostgREST a partir de lo que escribe
 * el usuario (quita caracteres con significado especial en la sintaxis).
 */
export function orSearch(query: string, textFields: string[], phoneFields: string[] = []): string | null {
  const q = query.replace(/[,()*%\\"']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const parts = textFields.map((f) => `${f}.ilike.*${q}*`);
  const digits = digitsOnly(query);
  if (digits.length >= 3) parts.push(...phoneFields.map((f) => `${f}.ilike.*${digits}*`));
  return parts.join(',');
}
