import { useMemo, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, ClipboardList, Clock, ExternalLink, Megaphone, MessageSquare, PhoneCall, PlayCircle, Sparkles, Users } from 'lucide-react';
import { useProfile } from '../../auth/AuthProvider';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { ContactActions } from '../../components/domain/ContactActions';
import { Badge, OptionBadge } from '../../components/ui/Badge';
import { Card, EmptyState, ErrorState, StatCard } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { ANNOUNCEMENT_CATEGORY, CONTACT_STATUS, PRIORITY_WEIGHT, TASK_PRIORITY, TASK_STATUS } from '../../config/labels';
import { env } from '../../config/env';
import { useAsync } from '../../hooks/useAsync';
import { listMyContacts } from '../../services/contacts';
import { listAnnouncementsWithRead, listInbox } from '../../services/communications';
import { listMyTasks } from '../../services/tasks';
import type { Task } from '../../types/database';
import { contactTitle, dueLabel, firstName, formatDate, formatLongToday, isOverdue, timeAgo } from '../../utils/format';
import { formatPhone } from '../../utils/phone';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Ordena lo que hay que hacer: vencidas, luego prioridad, luego fecha límite. */
export function sortActiveTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.status !== 'completada')
    .sort((a, b) => {
      const oa = isOverdue(a.due_date, a.status) ? 0 : 1;
      const ob = isOverdue(b.due_date, b.status) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const sa = a.status === 'en_proceso' ? 0 : a.status === 'pendiente' ? 1 : 2;
      const sb = b.status === 'en_proceso' ? 0 : b.status === 'pendiente' ? 1 : 2;
      if (sa !== sb) return sa - sb;
      if (PRIORITY_WEIGHT[a.priority] !== PRIORITY_WEIGHT[b.priority]) return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    });
}

export function EmployeeHome() {
  const profile = useProfile();
  const { summary, settings, liveVersion } = useWorkspace();

  const { data, loading, error, reload } = useAsync(
    () => Promise.all([listMyTasks(), listMyContacts(), listInbox(profile.id, 5), listAnnouncementsWithRead(profile.id, 20)]),
    [profile.id, liveVersion],
  );

  const view = useMemo(() => {
    if (!data) return null;
    const [tasks, contacts, inbox, announcements] = data;
    const active = sortActiveTasks(tasks);
    const completed = tasks
      .filter((t) => t.status === 'completada')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
      .slice(0, 3);
    const toReach = contacts
      .filter((c) => ['sin_contactar', 'seguimiento', 'interesado', 'respondio'].includes(c.status))
      .sort((a, b) => (a.status === 'sin_contactar' ? 1 : 0) - (b.status === 'sin_contactar' ? 1 : 0))
      .slice(0, 5);
    const instructions = announcements.filter((a) => a.pinned || a.category === 'instrucciones' || a.category === 'importante').slice(0, 2);
    const latestUpdates = announcements.slice(0, 3);
    return { active, completed, toReach, inbox, instructions, latestUpdates, overdue: active.filter((t) => isOverdue(t.due_date, t.status)) };
  }, [data]);

  const alerts = [
    view && view.overdue.length > 0 && {
      tone: 'red',
      icon: <AlertTriangle size={18} />,
      text: `Tienes ${view.overdue.length} ${view.overdue.length === 1 ? 'tarea vencida' : 'tareas vencidas'}`,
      to: '/app/tareas',
    },
    summary && summary.unread_messages > 0 && {
      tone: 'blue',
      icon: <MessageSquare size={18} />,
      text: `${summary.unread_messages} ${summary.unread_messages === 1 ? 'mensaje nuevo' : 'mensajes nuevos'} del administrador`,
      to: '/app/comunicaciones',
    },
    summary && summary.unread_announcements > 0 && {
      tone: 'gold',
      icon: <Megaphone size={18} />,
      text: `${summary.unread_announcements} ${summary.unread_announcements === 1 ? 'actualización sin leer' : 'actualizaciones sin leer'}`,
      to: '/app/actualizaciones',
    },
  ].filter(Boolean) as { tone: string; icon: ReactElement; text: string; to: string }[];

  return (
    <div className="page">
      <section className="hero-card">
        <div className="hero-text">
          <span className="eyebrow">{formatLongToday()}</span>
          <h1>
            {greeting()}, <em>{firstName(profile.full_name)}</em>
          </h1>
          <p>
            {summary
              ? summary.tasks_pending + summary.tasks_in_progress > 0
                ? `Tienes ${summary.tasks_pending + summary.tasks_in_progress} ${summary.tasks_pending + summary.tasks_in_progress === 1 ? 'tarea activa' : 'tareas activas'} y ${summary.contacts_uncontacted} ${summary.contacts_uncontacted === 1 ? 'contacto' : 'contactos'} por escribir.`
                : 'No tienes tareas activas. ¡Buen trabajo!'
              : 'Cargando tu resumen…'}
          </p>
        </div>
        <div className="hero-side">
          <Badge tone="green" dot>
            Activo
          </Badge>
          <span className="hero-meta">
            <Clock size={14} /> Última actividad: {timeAgo(profile.last_activity_at)}
          </span>
          <a href={env.webzipeSiteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            <ExternalLink size={15} />
            <span>Ver página de WebZipe</span>
          </a>
        </div>
      </section>

      <section aria-label="Lo importante primero" className="alerts-strip">
        {alerts.length ? (
          alerts.map((a) => (
            <Link key={a.text} to={a.to} className={`alert-row tone-${a.tone}`}>
              {a.icon}
              <span>{a.text}</span>
              <ArrowRight size={16} className="alert-arrow" />
            </Link>
          ))
        ) : (
          <div className="alert-row tone-green is-static">
            <CheckCircle2 size={18} />
            <span>Estás al día: sin mensajes nuevos ni tareas vencidas.</span>
          </div>
        )}
      </section>

      <div className="stats-grid">
        <StatCard label="Pendientes" value={summary?.tasks_pending ?? '—'} icon={<ClipboardList size={18} />} tone="amber" />
        <StatCard label="En proceso" value={summary?.tasks_in_progress ?? '—'} icon={<PlayCircle size={18} />} tone="blue" />
        <StatCard label="Completadas" value={summary?.tasks_completed ?? '—'} icon={<CheckCircle2 size={18} />} tone="green" />
        <StatCard label="Por contactar" value={summary?.contacts_uncontacted ?? '—'} icon={<Users size={18} />} tone="gold" hint={summary ? `de ${summary.contacts_total} contactos` : undefined} />
      </div>

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data && <SectionLoader />}

      {view && (
        <div className="dashboard-grid">
          <div className="dashboard-main">
            <Card title="Qué hacer ahora" action={<Link to="/app/tareas" className="text-link">Ver todas <ArrowRight size={14} /></Link>}>
              {view.active.length ? (
                <ul className="list-rows">
                  {view.active.slice(0, 5).map((t) => (
                    <li key={t.id}>
                      <Link to="/app/tareas" className="list-row">
                        <div className="list-row-main">
                          <strong>{t.title}</strong>
                          <span className={isOverdue(t.due_date, t.status) ? 'text-danger' : 'text-mute'}>
                            {dueLabel(t.due_date)}
                            {t.client_name ? ` · ${t.client_name}` : ''}
                          </span>
                        </div>
                        <div className="list-row-badges">
                          <OptionBadge value={t.priority} map={TASK_PRIORITY} dot={false} />
                          <OptionBadge value={t.status} map={TASK_STATUS} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<CheckCircle2 size={22} />} title="Sin tareas activas">
                  Cuando el administrador te asigne algo, aparecerá aquí.
                </EmptyState>
              )}
            </Card>

            <Card title="A quién escribir hoy" action={<Link to="/app/contactos" className="text-link">Mis contactos <ArrowRight size={14} /></Link>}>
              {view.toReach.length ? (
                <ul className="reach-list">
                  {view.toReach.map((c) => (
                    <li key={c.id} className="reach-row">
                      <div className="reach-info">
                        <strong>{contactTitle(c)}</strong>
                        <span className="mono">{formatPhone(c.phone, settings.default_country_code)}</span>
                        <OptionBadge value={c.status} map={CONTACT_STATUS} />
                      </div>
                      <ContactActions phone={c.phone} whatsapp={c.whatsapp} name={c.name} business={c.business} compact />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<PhoneCall size={22} />} title="No hay contactos pendientes">
                  No tienes contactos por escribir en este momento.
                </EmptyState>
              )}
            </Card>

            {view.completed.length > 0 && (
              <Card title="Terminadas recientemente">
                <ul className="list-rows compact">
                  {view.completed.map((t) => (
                    <li key={t.id} className="list-row is-static">
                      <CheckCircle2 size={16} className="text-ok" />
                      <div className="list-row-main">
                        <strong>{t.title}</strong>
                        <span className="text-mute">Completada {formatDate(t.completed_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="dashboard-side">
            <Card title={<><Sparkles size={16} /> Instrucciones</>} className="card-gold">
              {view.instructions.length ? (
                view.instructions.map((a) => (
                  <div key={a.id} className="instruction">
                    <div className="instruction-head">
                      <strong>{a.title}</strong>
                      <OptionBadge value={a.category} map={ANNOUNCEMENT_CATEGORY} dot={false} />
                    </div>
                    <p className="pre-line">{a.body}</p>
                  </div>
                ))
              ) : (
                <p className="text-mute">No hay instrucciones destacadas por ahora.</p>
              )}
            </Card>

            <Card title="Mensajes recientes" action={<Link to="/app/comunicaciones" className="text-link">Ver <ArrowRight size={14} /></Link>}>
              {view.inbox.length ? (
                <ul className="mini-list">
                  {view.inbox.slice(0, 3).map((m) => (
                    <li key={m.id} className={m.read_at ? '' : 'is-unread'}>
                      <Link to="/app/comunicaciones">
                        <strong>{m.title}</strong>
                        <span className="text-mute">
                          {m.sender_name} · {timeAgo(m.created_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-mute">Sin mensajes.</p>
              )}
            </Card>

            <Card title="Actualizaciones" action={<Link to="/app/actualizaciones" className="text-link">Ver <ArrowRight size={14} /></Link>}>
              {view.latestUpdates.length ? (
                <ul className="mini-list">
                  {view.latestUpdates.map((a) => (
                    <li key={a.id} className={a.read ? '' : 'is-unread'}>
                      <Link to="/app/actualizaciones">
                        <strong>
                          <Bell size={13} /> {a.title}
                        </strong>
                        <span className="text-mute">{timeAgo(a.published_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-mute">Sin actualizaciones.</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
