import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ExternalLink, LogOut, Menu, MoreHorizontal, X } from 'lucide-react';
import { useAuth, useProfile } from '../../auth/AuthProvider';
import { env } from '../../config/env';
import { ROLES } from '../../config/labels';
import { Avatar } from '../ui/Avatar';
import { CountBubble } from '../ui/Badge';
import { Logo } from '../ui/Logo';
import { useConfirm } from '../ui/Feedback';

export type NavItem = {
  to: string;
  label: string;
  /** Texto corto para la barra inferior del teléfono. */
  shortLabel?: string;
  icon: ReactNode;
  badge?: number;
  end?: boolean;
  /** Aparece en la barra inferior del teléfono (máximo 4). */
  mobile?: boolean;
  /** Sección de la barra lateral. */
  section?: string;
};

type Props = {
  area: 'employee' | 'admin';
  items: NavItem[];
  extraLinks?: { to: string; label: string; icon: ReactNode }[];
  topbarExtra?: ReactNode;
  children: ReactNode;
};

export function AppShell({ area, items, extraLinks = [], topbarExtra, children }: Props) {
  const profile = useProfile();
  const { signOut } = useAuth();
  const confirm = useConfirm();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [drawerOpen]);

  const handleSignOut = async () => {
    if (await confirm({ title: '¿Cerrar sesión?', message: 'Tendrás que ingresar de nuevo con tu usuario y contraseña.', confirmLabel: 'Cerrar sesión' })) {
      await signOut();
    }
  };

  const mobileItems = items.filter((i) => i.mobile).slice(0, 4);
  const hiddenBadges = items.filter((i) => !i.mobile).reduce((sum, i) => sum + (i.badge ?? 0), 0);
  const sections = Array.from(new Set(items.map((i) => i.section ?? '')));

  const sidebar = (
    <>
      <div className="sidebar-brand">
        <Logo tag={area === 'admin' ? 'Admin' : 'Empleados'} />
        <button type="button" className="icon-btn drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú">
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
        {sections.map((section) => (
          <div key={section || 'main'} className="nav-section">
            {section && <span className="nav-section-title">{section}</span>}
            {items
              .filter((i) => (i.section ?? '') === section)
              .map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  <CountBubble count={item.badge ?? 0} />
                </NavLink>
              ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        {extraLinks.map((l) => (
          <NavLink key={l.to} to={l.to} className="nav-link nav-link-subtle">
            <span className="nav-icon">{l.icon}</span>
            <span className="nav-label">{l.label}</span>
          </NavLink>
        ))}
        <a href={env.webzipeSiteUrl} target="_blank" rel="noopener noreferrer" className="nav-link nav-link-subtle">
          <span className="nav-icon">
            <ExternalLink size={18} />
          </span>
          <span className="nav-label">Ir a WebZipe</span>
        </a>
        <div className="sidebar-user">
          <Avatar name={profile.full_name} url={profile.avatar_url} size={36} />
          <div className="sidebar-user-info">
            <strong>{profile.full_name}</strong>
            <span>{ROLES[profile.role].label}</span>
          </div>
          <button type="button" className="icon-btn" onClick={handleSignOut} aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className={`shell shell-${area}`}>
      <aside className={`sidebar ${drawerOpen ? 'is-open' : ''}`}>{sidebar}</aside>
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <div className="shell-main">
        <header className="topbar">
          <button type="button" className="icon-btn topbar-menu" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú">
            <Menu size={22} />
          </button>
          <div className="topbar-brand">
            <Logo size="sm" />
          </div>
          <div className="topbar-spacer" />
          {topbarExtra}
          <NavLink to="/app/perfil" className="topbar-avatar" aria-label="Mi perfil">
            <Avatar name={profile.full_name} url={profile.avatar_url} size={34} />
          </NavLink>
        </header>

        <main className="content" id="contenido">
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navegación rápida">
        {mobileItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `bottom-link ${isActive ? 'is-active' : ''}`}>
            <span className="bottom-icon">
              {item.icon}
              <CountBubble count={item.badge ?? 0} />
            </span>
            <span>{item.shortLabel ?? item.label}</span>
          </NavLink>
        ))}
        <button type="button" className="bottom-link" onClick={() => setDrawerOpen(true)}>
          <span className="bottom-icon">
            <MoreHorizontal size={22} />
            <CountBubble count={hiddenBadges} />
          </span>
          <span>Más</span>
        </button>
      </nav>
    </div>
  );
}
