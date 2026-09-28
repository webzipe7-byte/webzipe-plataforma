import { Logo } from './Logo';

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Cargando" />;
}

export function PageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="page-loader">
      <Logo size="lg" />
      <div className="page-loader-row">
        <Spinner />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function SectionLoader() {
  return (
    <div className="section-loader" aria-busy="true">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}
