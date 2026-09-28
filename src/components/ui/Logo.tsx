/** Logo de WebZipe (misma marca que la página oficial). */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 42 L27 88 L42 55 L55 88 L78 26" stroke="var(--blue)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M68 44 L78 26" stroke="var(--blue-bright)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="80" cy="24" r="7" fill="var(--blue-bright)" />
      </svg>
    </span>
  );
}

export function Logo({ size = 'md', tag }: { size?: 'sm' | 'md' | 'lg'; tag?: string }) {
  const mark = size === 'lg' ? 44 : size === 'sm' ? 26 : 32;
  return (
    <span className={`logo logo-${size}`}>
      <LogoMark size={mark} />
      <span className="logo-word">
        Web<span className="logo-accent">Zipe</span>
      </span>
      {tag && <span className="logo-tag">{tag}</span>}
    </span>
  );
}
