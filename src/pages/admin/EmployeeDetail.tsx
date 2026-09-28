import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Link2, Mail, MessageSquare, Pencil, Phone, Power } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { ActivityFeed } from '../../components/domain/ActivityFeed';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Feedback';
import { Card, ChipTabs, EmptyState, ErrorState, StatCard } from '../../components/ui/Misc';
import { PageLoader } from '../../components/ui/Spinner';
import { CONTACT_STATUS, EMPLOYEE_STATUS, ROLES, TASK_PRIORITY, TASK_STATUS } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { listActivity } from '../../services/admin';
import { listContacts } from '../../services/contacts';
import { createInviteLink, getEmployee, getEmployeeNotes } from '../../services/employees';
import { listTasks } from '../../services/tasks';
import { friendlyError } from '../../utils/errors';
import { contactTitle, dueLabel, formatDate, formatDateTime, isOnline, isOverdue, timeAgo } from '../../utils/format';
import { formatPhone } from '../../utils/phone';
import { EmployeeFormModal } from './components/EmployeeFormModal';
import { InviteLinkModal, type InviteInfo } from './components/InviteLinkModal';
import { TaskFormModal } from './components/TaskFormModal';
import { useAdminActions } from './components/useAdminActions';
import { canManage } from './Employees';

export function EmployeeDetail() {
  const { id = '' } = useParams();
  const auth = useAuth();
  const me = auth.status === 'signedIn' ? auth.profile : null;
  const { settings } = useWorkspace();
  const toast = useToast();
  const { toggleStatus } = useAdminActions();
  const [tab, setTab] = useState<'tareas' | 'contactos' | 'actividad'>('tareas');
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  const { data, loading, error, reload, setData } = useAsync(
    () =>
      Promise.all([
        getEmployee(id),
        getEmployeeNotes(id),
        listTasks({ employeeId: id, pageSize: 200, sort: 'due' }),
        listContacts({ employeeId: id, pageSize: 500, sort: 'assigned' }),
        listActivity({ employeeId: id, pageSize: 30 }),
      ]),
    [id],
  );

  if (loading && !data) return <PageLoader label="Cargando empleado…" />;
  if (error || !data) return <ErrorState message={error ?? 'No se encontró el empleado.'} onRetry={() => reload()} />;

  const [employee, notes, tasks, contacts, activity] = data;
  const manageable = me ? canManage(me, employee) : false;
  const active = tasks.rows.filter((t) => t.status !== 'completada');
  const done = tasks.rows.filter((t) => t.status === 'completada');

  const link = async () => {
    try {
      const res = await createInviteLink(employee.id);
      setInvite({ url: res.invite_url, expiresAt: res.expires_at, purpose: res.purpose, employee });
    } catch (err) {
      toast.error('No se pudo generar el enlace', friendlyError(err));
    }
  };

  return (
    <div className="page">
      <Link to="/admin/empleados" className="back-link">
        <ArrowLeft size={16} /> Empleados
      </Link>

      <section className="profile-hero card">
        <Avatar name={employee.full_name} url={employee.avatar_url} size={72} online={employee.status === 'active' ? isOnline(employee.last_activity_at) : undefined} />
        <div className="profile-hero-info">
          <h1>{employee.full_name}</h1>
          <p className="text-mute">
            @{employee.username} · {ROLES[employee.role].label}
          </p>
          <div className="badge-row">
            <OptionBadge value={employee.status} map={EMPLOYEE_STATUS} />
            {!employee.password_set_at && <Badge tone="amber">No ha activado su cuenta</Badge>}
            <Badge tone="muted">Última actividad: {timeAgo(employee.last_activity_at)}</Badge>
          </div>
        </div>
        <div className="profile-hero-actions">
          {employee.status === 'active' && (
            <Button variant="primary" icon={<ClipboardList size={16} />} onClick={() => setTaskOpen(true)}>
              Asignar tarea
            </Button>
          )}
          <Link to={`/admin/comunicaciones?para=${employee.id}`} className="btn btn-secondary btn-md">
            <MessageSquare size={16} />
            <span>Mensaje</span>
          </Link>
          {manageable && (
            <>
              <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => setEditOpen(true)}>
                Editar
              </Button>
              {employee.status === 'active' && (
                <Button variant="ghost" icon={<Link2 size={16} />} onClick={link}>
                  {employee.password_set_at ? 'Restablecer contraseña' : 'Enlace de activación'}
                </Button>
              )}
              {employee.id !== me?.id && (
                <Button
                  variant={employee.status === 'active' ? 'danger' : 'secondary'}
                  icon={<Power size={16} />}
                  onClick={async () => {
                    const updated = await toggleStatus(employee);
                    if (updated) setData((d) => (d ? [updated, d[1], d[2], d[3], d[4]] : d));
                  }}
                >
                  {employee.status === 'active' ? 'Desactivar' : 'Reactivar'}
                </Button>
              )}
            </>
          )}
        </div>
      </section>

      <div className="stats-grid">
        <StatCard label="Tareas activas" value={active.length} tone="amber" hint={`${active.filter((t) => isOverdue(t.due_date, t.status)).length} vencidas`} />
        <StatCard label="Completadas" value={done.length} tone="green" />
        <StatCard label="Contactos asignados" value={contacts.count} tone="blue" hint={`${contacts.rows.filter((c) => c.status === 'sin_contactar').length} sin contactar`} />
        <StatCard label="Clientes logrados" value={contacts.rows.filter((c) => c.status === 'cliente').length} tone="gold" />
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <ChipTabs
            label="Secciones del empleado"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'tareas', label: 'Tareas', count: tasks.count },
              { value: 'contactos', label: 'Contactos', count: contacts.count },
              { value: 'actividad', label: 'Actividad' },
            ]}
          />

          {tab === 'tareas' && (
            <Card padded={false}>
              {tasks.rows.length ? (
                <ul className="list-rows">
                  {[...active, ...done].map((t) => (
                    <li key={t.id} className="list-row is-static">
                      <div className="list-row-main">
                        <strong>{t.title}</strong>
                        <span className={isOverdue(t.due_date, t.status) ? 'text-danger' : 'text-mute'}>
                          {t.status === 'completada' ? `Completada ${formatDateTime(t.completed_at)}` : dueLabel(t.due_date)}
                          {t.client_name ? ` · ${t.client_name}` : ''}
                          {t.employee_note ? ` · Nota: ${t.employee_note}` : ''}
                        </span>
                      </div>
                      <div className="list-row-badges">
                        <OptionBadge value={t.priority} map={TASK_PRIORITY} dot={false} />
                        <OptionBadge value={t.status} map={TASK_STATUS} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<ClipboardList size={22} />} title="Sin tareas asignadas" />
              )}
            </Card>
          )}

          {tab === 'contactos' && (
            <Card padded={false}>
              {contacts.rows.length ? (
                <ul className="list-rows">
                  {contacts.rows.map((c) => (
                    <li key={c.id} className="list-row is-static">
                      <div className="list-row-main">
                        <strong>{contactTitle(c)}</strong>
                        <span className="text-mute">
                          <span className="mono">{formatPhone(c.phone, settings.default_country_code)}</span> · asignado {formatDate(c.assigned_at)}
                          {c.city ? ` · ${c.city}` : ''}
                        </span>
                      </div>
                      <OptionBadge value={c.status} map={CONTACT_STATUS} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Sin contactos asignados" action={<Link to="/admin/contactos?empleado=none" className="btn btn-secondary btn-sm">Asignar contactos</Link>} />
              )}
            </Card>
          )}

          {tab === 'actividad' && (
            <Card>
              <ActivityFeed items={activity.rows} />
            </Card>
          )}
        </div>

        <div className="dashboard-side">
          <Card title="Datos">
            <dl className="data-list">
              <div>
                <dt>
                  <Mail size={15} /> Correo
                </dt>
                <dd>{employee.email}</dd>
              </div>
              <div>
                <dt>
                  <Phone size={15} /> Teléfono
                </dt>
                <dd>{employee.phone || '—'}</dd>
              </div>
              <div>
                <dt>Ingreso</dt>
                <dd>{formatDate(employee.hire_date)}</dd>
              </div>
              <div>
                <dt>Último inicio de sesión</dt>
                <dd>{formatDateTime(employee.last_login_at)}</dd>
              </div>
              <div>
                <dt>Cuenta creada</dt>
                <dd>{formatDate(employee.created_at)}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Notas internas">
            <p className={notes ? 'pre-line' : 'text-mute'}>{notes || 'Sin notas.'}</p>
          </Card>
        </div>
      </div>

      <EmployeeFormModal
        open={editOpen}
        employee={employee}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          toast.success('Empleado actualizado');
          void reload(true);
        }}
      />
      <TaskFormModal
        open={taskOpen}
        defaults={{ assigned_to: employee.id }}
        onClose={() => setTaskOpen(false)}
        onSaved={() => {
          setTaskOpen(false);
          toast.success('Tarea asignada');
          void reload(true);
        }}
      />
      <InviteLinkModal invite={invite} onClose={() => setInvite(null)} />
    </div>
  );
}
