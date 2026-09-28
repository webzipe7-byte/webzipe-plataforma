import type { ReactNode } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="search-input">
      <Search size={16} aria-hidden="true" />
      <input type="search" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Limpiar búsqueda">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, action, children, className = '', padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`card ${padded ? '' : 'card-flush'} ${className}`}>
      {(title || action) && (
        <header className="card-header">
          {title && <h2 className="card-title">{title}</h2>}
          {action && <div className="card-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, icon, tone = 'blue', hint, onClick }: { label: string; value: ReactNode; icon?: ReactNode; tone?: 'blue' | 'gold' | 'green' | 'amber' | 'red' | 'neutral' | 'violet'; hint?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat-card stat-${tone} ${onClick ? 'is-clickable' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </Tag>
  );
}

export function Pagination({ page, pageSize, count, onPage }: { page: number; pageSize: number; count: number; onPage: (p: number) => void }) {
  if (count <= pageSize) return count ? <p className="pagination-info">{count} resultados</p> : null;
  const from = page * pageSize + 1;
  const to = Math.min(count, (page + 1) * pageSize);
  return (
    <nav className="pagination" aria-label="Paginación">
      <span className="pagination-info">
        {from}–{to} de {count}
      </span>
      <div className="pagination-buttons">
        <Button size="sm" variant="ghost" icon={<ChevronLeft size={16} />} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Página anterior" />
        <Button size="sm" variant="ghost" icon={<ChevronRight size={16} />} disabled={to >= count} onClick={() => onPage(page + 1)} aria-label="Página siguiente" />
      </div>
    </nav>
  );
}

/** Filtros en forma de "chips" (pestañas). */
export function ChipTabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div className="chip-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`chip ${value === o.value ? 'is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}
