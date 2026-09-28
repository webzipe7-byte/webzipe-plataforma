import { Outlet } from 'react-router-dom';
import { Activity, Bell, ClipboardList, Hash, LayoutDashboard, Megaphone, MessageSquare, Settings, UserRound, Users, Contact2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { AppShell, type NavItem } from '../../components/layout/AppShell';
import { WorkspaceProvider, useWorkspace } from '../../components/layout/WorkspaceProvider';
import { QuickSearch } from './components/QuickSearch';

function AdminShell() {
  const { isAdmin } = useAuth();
  const { summary } = useWorkspace();

  const items: NavItem[] = [
    { to: '/admin', label: 'Dashboard', shortLabel: 'Inicio', icon: <LayoutDashboard size={20} />, end: true, mobile: true },
    { to: '/admin/empleados', label: 'Empleados', icon: <Users size={20} />, mobile: true, section: 'Equipo' },
    { to: '/admin/tareas', label: 'Tareas', icon: <ClipboardList size={20} />, mobile: true, section: 'Equipo' },
    { to: '/admin/contactos', label: 'Contactos', icon: <Contact2 size={20} />, mobile: true, section: 'Clientes' },
    { to: '/admin/numeros', label: 'Números', icon: <Hash size={20} />, section: 'Clientes' },
    { to: '/admin/comunicaciones', label: 'Comunicaciones', icon: <MessageSquare size={20} />, section: 'Comunicación' },
    { to: '/admin/actualizaciones', label: 'Actualizaciones', icon: <Megaphone size={20} />, section: 'Comunicación' },
    { to: '/admin/actividad', label: 'Actividad', icon: <Activity size={20} />, section: 'Sistema' },
    ...(isAdmin ? [{ to: '/admin/configuracion', label: 'Configuración', icon: <Settings size={20} />, section: 'Sistema' }] : []),
  ];

  const unread = (summary?.unread_messages ?? 0) + (summary?.unread_announcements ?? 0);

  return (
    <AppShell
      area="admin"
      items={items}
      extraLinks={[{ to: '/app', label: 'Mi portal de empleado', icon: unread ? <Bell size={18} /> : <UserRound size={18} /> }]}
      topbarExtra={<QuickSearch />}
    >
      <Outlet />
    </AppShell>
  );
}

export function AdminLayout() {
  return (
    <WorkspaceProvider>
      <AdminShell />
    </WorkspaceProvider>
  );
}
