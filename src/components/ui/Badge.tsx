import type { ReactNode } from 'react';
import type { Tone } from '../../config/labels';

export function Badge({ tone = 'neutral', children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

/** Badge a partir de un mapa de opciones (estado, prioridad, rol…). */
export function OptionBadge<T extends string>({ value, map, dot = true }: { value: T; map: Record<T, { label: string; tone: Tone }>; dot?: boolean }) {
  const opt = map[value];
  if (!opt) return <Badge>{value}</Badge>;
  return (
    <Badge tone={opt.tone} dot={dot}>
      {opt.label}
    </Badge>
  );
}

export function CountBubble({ count }: { count: number }) {
  if (!count) return null;
  return <span className="count-bubble">{count > 99 ? '99+' : count}</span>;
}
