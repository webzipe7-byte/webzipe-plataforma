import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'whatsapp';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', loading, icon, block, children, className = '', disabled, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${block ? 'btn-block' : ''} ${!children ? 'btn-icon-only' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

type LinkProps = {
  href: string;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  children?: ReactNode;
  external?: boolean;
  title?: string;
  className?: string;
  onClick?: () => void;
};

/** Enlace con apariencia de botón (WhatsApp, llamar, sitio web…). */
export function LinkButton({ href, variant = 'secondary', size = 'md', icon, children, external, title, className = '', onClick }: LinkProps) {
  return (
    <a
      href={href}
      className={`btn btn-${variant} btn-${size} ${!children ? 'btn-icon-only' : ''} ${className}`}
      title={title}
      aria-label={!children ? title : undefined}
      onClick={onClick}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {icon}
      {children && <span>{children}</span>}
    </a>
  );
}
