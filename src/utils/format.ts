const dateFmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const dateShortFmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const longDateFmt = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

/** Convierte "2026-09-27" (fecha sin hora) en fecha local sin desfase de zona horaria. */
function parse(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = parse(value);
  return d.getFullYear() === new Date().getFullYear() ? dateShortFmt.format(d) : dateFmt.format(d);
}

export function formatTime(value: string | null | undefined): string {
  return value ? timeFmt.format(parse(value)) : '—';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return `${formatDate(value)}, ${formatTime(value)}`;
}

export function formatLongToday(): string {
  const s = longDateFmt.format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "hace 5 min", "ayer", "hace 3 días"… */
export function timeAgo(value: string | null | undefined): string {
  if (!value) return 'Nunca';
  const diff = Date.now() - parse(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Ahora mismo';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 30) return `Hace ${d} días`;
  return formatDate(value);
}

export function isOnline(lastActivity: string | null | undefined): boolean {
  return !!lastActivity && Date.now() - new Date(lastActivity).getTime() < 10 * 60000;
}

export function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function isOverdue(dueDate: string | null, status?: string): boolean {
  return !!dueDate && status !== 'completada' && dueDate < todayISO();
}

export function dueLabel(dueDate: string | null): string {
  if (!dueDate) return 'Sin fecha límite';
  const today = todayISO();
  if (dueDate === today) return 'Vence hoy';
  const diff = Math.round((parse(dueDate).getTime() - parse(today).getTime()) / 86400000);
  if (diff === 1) return 'Vence mañana';
  if (diff < 0) return `Venció hace ${-diff} ${-diff === 1 ? 'día' : 'días'}`;
  if (diff < 7) return `Vence en ${diff} días`;
  return `Vence ${formatDate(dueDate)}`;
}

export function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export function firstName(name: string): string {
  return name.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] ?? name;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Nombre visible de un contacto. */
export function contactTitle(c: { name: string | null; business: string | null; phone: string }): string {
  return c.business || c.name || c.phone;
}

/** Asegura que un enlace externo tenga protocolo https. */
export function externalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}
