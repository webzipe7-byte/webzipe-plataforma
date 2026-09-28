// Formato y enlaces de teléfono. La normalización definitiva la hace la base
// de datos (private.normalize_phone); esta versión es solo para la interfaz.

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizePhone(value: string, countryCode = '57'): string | null {
  let d = digitsOnly(value);
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && !d.startsWith(countryCode)) d = countryCode + d;
  return d.length >= 7 && d.length <= 15 ? d : null;
}

/** 573001234567 → "300 123 4567"; otros países → "+44 20…". */
export function formatPhone(value: string | null | undefined, countryCode = '57'): string {
  if (!value) return '—';
  const d = digitsOnly(value);
  if (d.startsWith(countryCode) && d.length === countryCode.length + 10) {
    const n = d.slice(countryCode.length);
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return `+${d}`;
}

export function telLink(value: string): string {
  return `tel:+${digitsOnly(value)}`;
}

export function whatsappLink(value: string, message?: string): string {
  const base = `https://wa.me/${digitsOnly(value)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Rellena la plantilla de WhatsApp: {nombre}, {empresa}, {empleado}. */
export function fillTemplate(
  template: string,
  data: { name?: string | null; business?: string | null; employee?: string | null },
): string {
  return template
    .replace(/\{nombre\}/g, data.name || '')
    .replace(/\{empresa\}/g, data.business || 'tu negocio')
    .replace(/\{empleado\}/g, data.employee || '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}
