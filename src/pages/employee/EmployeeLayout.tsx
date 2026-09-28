import { Outlet } from 'react-router-dom';
import { Bell, ClipboardList, Home, LayoutDashboard, MessageSquare, UserRound, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { AppShell, type NavItem } from '../../components/layout/AppShell';
import { useWorkspace, WorkspaceProvider } from '../../components/layout/WorkspaceProvider';

function EmployeeShell() {
  const { summary } = useWorkspace();
  const { isStaff } = useAuth();

  const items: NavItem[] = [
    { to: '/app', label: 'Inicio', icon: <Home size={20} />, end: true, mobile: true },
    { to: '/app/tareas', label: 'Mis tareas', shortLabel: 'Tareas', icon: <ClipboardList size={20} />, badge: (summary?.tasks_pending ?? 0) + (summary?.tasks_in_progress ?? 0), mobile: true },
    { to: '/app/contactos', label: 'Mis contactos', shortLabel: 'Contactos', icon: <Users size={20} />, mobile: true },
    { to: '/app/comunicaciones', label: 'Comunicaciones', shortLabel: 'Mensajes', icon: <MessageSquare size={20} />, badge: summary?.unread_messages ?? 0, mobile: true },
    { to: '/app/actualizaciones', label: 'Actualizaciones', icon: <Bell size={20} />, badge: summary?.unread_announcements ?? 0 },
    { to: '/app/perfil', label: 'Mi perfil', icon: <UserRound size={20} /> },
  ];

  return (
    <AppShell area="employee" items={items} extraLinks={isStaff ? [{ to: '/admin', label: 'Panel de administración', icon: <LayoutDashboard size={18} /> }] : []}>
      <Outlet />
    </AppShell>
  );
}

export function EmployeeLayout() {
  return (
    <WorkspaceProvider>
      <EmployeeShell />
    </WorkspaceProvider>
  );
}
