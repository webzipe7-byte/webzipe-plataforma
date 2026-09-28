import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Contact2, Megaphone, MessageSquare, PlayCircle, UserPlus, Users } from 'lucide-react';
import { useProfile } from '../../auth/AuthProvider';
import { ActivityFeed } from '../../components/domain/ActivityFeed';
import { useRealtime } from '../../hooks/useRealtime';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, ErrorState, PageHeader, StatCard } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { ANNOUNCEMENT_CATEGORY, ROLES } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { getDashboardStats, listActivity } from '../../services/admin';
import { listAnnouncementsAdmin } from '../../services/communications';
import { getWorkload } from '../../services/employees';
import type { WorkloadRow } from '../../types/database';
import { firstName, formatLongToday, isOnline, timeAgo } from '../../utils/format';
import { TaskFormModal } from './components/TaskFormModal';
import { EmployeeFormModal } from './components/EmployeeFormModal';
import { InviteLinkModal, type InviteInfo } from './components/InviteLinkModal';

function needsWork(w: WorkloadRow) {
  return w.status === 'active' && w.tasks_pending + w.tasks_in_progress === 0 && w.contacts_uncontacted === 0;
}

export function AdminDashboard() {
  const profile = useProfile();
  const navigate = useNavigate();
  const [taskOpen, setTaskOpen] = useState<{ assigned_to?: string } | null>(null);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([getDashboardStats(), getWorkload(), listActivity({ pageSize: 12 }), listAnnouncementsAdmin()]),
    [],
  );
  // Actualización en vivo (agrupada) cuando los empleados cambian tareas o contactos.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveReload = () => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void reload(true);
    }, 2500);
  };
  useEffect(() => () => void (pending.current && clearTimeout(pending.current)), []);
  useRealtime('tasks', liveReload);
  useRealtime('contacts', liveReload);

  const stats = data?.[0] ?? null;
  const workload: WorkloadRow[] = data?.[1] ?? [];
  const activity = data?.[2].rows ?? [];
  const announcements = data?.[3] ?? [];
  const team = workload.filter((w) => w.status === 'active');
  const idle = team.filter(needsWork);

  return (
    <div className="page">
      <PageHeader
        eyebrow={formatLongToday()}
        title={
          <>
            Hola, <em>{firstName(profile.full_name)}</em>
          </>
        }
        subtitle="Resumen del equipo y de los contactos en tiempo real."
        actions={
          <>
            <Button variant="secondary" icon={<UserPlus size={16} />} onClick={() => setEmployeeOpen(true)}>
              Nuevo empleado
            </Button>
            <Button variant="primary" icon={<ClipboardList size={16} />} onClick={() => setTaskOpen({})}>
              Asignar tarea
            </Button>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data && <SectionLoader />}

      {stats && (
        <>
          <section className="kpi-section">
            <h2 className="section-title">Empleados y tareas</h2>
            <div className="stats-grid stats-grid-5">
              <StatCard label="Empleados activos" value={stats.employees_active} icon={<Users size={18} />} tone="blue" hint={stats.employees_pending_activation ? `${stats.employees_pending_activation} sin activar su cuenta` : `${stats.employees_inactive} inactivos`} onClick={() => navigate('/admin/empleados')} />
              <StatCard label="Tareas pendientes" value={stats.tasks_pendiente} icon={<ClipboardList size={18} />} tone="amber" hint={stats.tasks_overdue ? `${stats.tasks_overdue} vencidas` : 'Ninguna vencida'} onClick={() => navigate('/admin/tareas?estado=pendiente')} />
              <StatCard label="En proceso" value={stats.tasks_en_proceso} icon={<PlayCircle size={18} />} tone="violet" hint={stats.tasks_pausada ? `${stats.tasks_pausada} pausadas` : undefined} onClick={() => navigate('/admin/tareas?estado=en_proceso')} />
              <StatCard label="Completadas" value={stats.tasks_completada} icon={<CheckCircle2 size={18} />} tone="green" hint={`${stats.tasks_completed_today} hoy`} onClick={() => navigate('/admin/tareas?estado=completada')} />
              <StatCard label="Sin responsable" value={stats.contacts_unassigned} icon={<Contact2 size={18} />} tone="neutral" hint="contactos por asignar" onClick={() => navigate('/admin/contactos?empleado=none')} />
            </div>
          </section>

          <section className="kpi-section">
            <h2 className="section-title">Contactos</h2>
            <div className="funnel">
              {[
                { label: 'Total', value: stats.contacts_total, to: '/admin/contactos' },
                { label: 'Sin contactar', value: stats.contacts_sin_contactar, to: '/admin/contactos?estado=sin_contactar' },
                { label: 'Contactados', value: stats.contacts_contactados, to: '/admin/contactos' },
                { label: 'Interesados', value: stats.contacts_interesados, to: '/admin/contactos?estado=interesado' },
                { label: 'Clientes', value: stats.contacts_clientes, to: '/admin/contactos?estado=cliente' },
              ].map((s, i) => (
                <Link key={s.label} to={s.to} className={`funnel-step step-${i}`}>
                  <span className="funnel-value">{s.value}</span>
                  <span className="funnel-label">{s.label}</span>
                  <span className="funnel-bar" style={{ width: `${stats.contacts_total ? Math.max(4, (s.value / stats.contacts_total) * 100) : 4}%` }} />
                </Link>
              ))}
            </div>
          </section>

          {idle.length > 0 && (
            <div className="alert-row tone-gold is-static">
              <AlertTriangle size={18} />
              <span>
                {idle.length === 1 ? `${idle[0].full_name} no tiene` : `${idle.length} empleados no tienen`} tareas activas ni contactos por trabajar.
              </span>
              <Button size="sm" variant="gold" onClick={() => setTaskOpen({ assigned_to: idle.length === 1 ? idle[0].employee_id : undefined })}>
                Asignar trabajo
              </Button>
            </div>
          )}

          <div className="dashboard-grid">
            <div className="dashboard-main">
              <Card title="Qué está haciendo el equipo" action={<Link to="/admin/empleados" className="text-link">Empleados <ArrowRight size={14} /></Link>} padded={false}>
                <div className="table-wrap">
                  <table className="table table-responsive">
                    <thead>
                      <tr>
                        <th>Empleado</th>
                        <th>Pendientes</th>
                        <th>En proceso</th>
                        <th>Hechas (7 días)</th>
                        <th>Contactos</th>
                        <th>Actividad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.map((w) => (
                        <tr key={w.employee_id} onClick={() => navigate(`/admin/empleados/${w.employee_id}`)} className="is-clickable">
                          <td data-label="Empleado">
                            <div className="person-cell">
                              <Avatar name={w.full_name} url={w.avatar_url} size={32} online={isOnline(w.last_activity_at)} />
                              <div>
                                <strong>{w.full_name}</strong>
                                <span className="text-mute small">
                                  {ROLES[w.role].label}
                                  {!w.password_set && ' · sin activar'}
                                </span>
                              </div>
                              {needsWork(w) && <Badge tone="gold">Necesita tareas</Badge>}
                            </div>
                          </td>
                          <td data-label="Pendientes">
                            {w.tasks_pending}
                            {w.tasks_overdue > 0 && <span className="text-danger small"> ({w.tasks_overdue} vencidas)</span>}
                          </td>
                          <td data-label="En proceso">{w.tasks_in_progress}</td>
                          <td data-label="Hechas (7 días)">{w.tasks_completed_7d}</td>
                          <td data-label="Contactos">
                            {w.contacts_total}
                            {w.contacts_uncontacted > 0 && <span className="text-mute small"> · {w.contacts_uncontacted} sin contactar</span>}
                          </td>
                          <td data-label="Actividad" className="text-mute">
                            {timeAgo(w.last_activity_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!team.length && <p className="text-mute pad">Aún no hay empleados activos. Crea el primero.</p>}
                </div>
              </Card>
            </div>

            <div className="dashboard-side">
              <Card title="Actividad reciente" action={<Link to="/admin/actividad" className="text-link">Ver todo <ArrowRight size={14} /></Link>}>
                <ActivityFeed items={activity} showBadge={false} />
              </Card>
              <Card title="Últimas actualizaciones" action={<Link to="/admin/actualizaciones" className="text-link">Publicar <Megaphone size={14} /></Link>}>
                {announcements.slice(0, 3).map((a) => (
                  <div key={a.id} className="mini-announcement">
                    <strong>{a.title}</strong>
                    <div className="badge-row">
                      <OptionBadge value={a.category} map={ANNOUNCEMENT_CATEGORY} dot={false} />
                      <span className="text-mute small">
                        {timeAgo(a.published_at)} · leída por {a.reads?.[0]?.count ?? 0}
                      </span>
                    </div>
                  </div>
                ))}
                {!announcements.length && <p className="text-mute">Aún no has publicado actualizaciones.</p>}
              </Card>
              <Card title="Acciones rápidas">
                <div className="quick-actions">
                  <Link to="/admin/contactos" className="quick-action">
                    <Contact2 size={18} /> Asignar contactos
                  </Link>
                  <Link to="/admin/comunicaciones" className="quick-action">
                    <MessageSquare size={18} /> Enviar mensaje
                  </Link>
                  <Link to="/admin/actualizaciones" className="quick-action">
                    <Megaphone size={18} /> Publicar actualización
                  </Link>
                  <Link to="/admin/numeros" className="quick-action">
                    <ClipboardList size={18} /> Control de números
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      <TaskFormModal
        open={!!taskOpen}
        defaults={taskOpen ?? undefined}
        onClose={() => setTaskOpen(null)}
        onSaved={() => {
          setTaskOpen(null);
          void reload(true);
        }}
      />
      <EmployeeFormModal
        open={employeeOpen}
        onClose={() => setEmployeeOpen(false)}
        onSaved={(_, inv) => {
          setEmployeeOpen(false);
          if (inv) setInvite(inv);
          void reload(true);
        }}
      />
      <InviteLinkModal invite={invite} onClose={() => setInvite(null)} />
    </div>
  );
}
