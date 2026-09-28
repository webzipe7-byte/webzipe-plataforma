import { useState } from 'react';
import { Bell, CheckCheck, Pin } from 'lucide-react';
import { useProfile } from '../../auth/AuthProvider';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Feedback';
import { ChipTabs, EmptyState, ErrorState, PageHeader } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { ANNOUNCEMENT_CATEGORY } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { listAnnouncementsWithRead, markAllRead, setAnnouncementRead } from '../../services/communications';
import type { AnnouncementWithRead } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { formatDateTime, timeAgo } from '../../utils/format';

export function Updates() {
  const profile = useProfile();
  const toast = useToast();
  const { liveVersion, refreshSummary } = useWorkspace();
  const { data, loading, error, reload, setData } = useAsync(() => listAnnouncementsWithRead(profile.id), [profile.id, liveVersion]);
  const [filter, setFilter] = useState<'todas' | 'no_leidas'>('todas');

  const items = data ?? [];
  const unread = items.filter((a) => !a.read).length;
  const visible = filter === 'no_leidas' ? items.filter((a) => !a.read) : items;

  const toggle = async (a: AnnouncementWithRead) => {
    setData((list) => (list ?? []).map((x) => (x.id === a.id ? { ...x, read: !a.read } : x)));
    try {
      await setAnnouncementRead(a.id, !a.read);
      void refreshSummary();
    } catch (err) {
      toast.error('No se pudo actualizar', friendlyError(err));
      void reload(true);
    }
  };

  const readAll = async () => {
    try {
      await markAllRead('announcements');
      setData((list) => (list ?? []).map((x) => ({ ...x, read: true })));
      void refreshSummary();
    } catch (err) {
      toast.error('No se pudo actualizar', friendlyError(err));
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Actualizaciones"
        subtitle="Instrucciones, cambios de proceso, campañas y novedades de WebZipe."
        actions={
          unread > 0 && (
            <Button variant="ghost" icon={<CheckCheck size={16} />} onClick={readAll}>
              Marcar todas como leídas
            </Button>
          )
        }
      />
      <ChipTabs
        label="Filtrar actualizaciones"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'todas', label: 'Todas', count: items.length },
          { value: 'no_leidas', label: 'No leídas', count: unread },
        ]}
      />

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : visible.length ? (
        <div className="announcement-list">
          {visible.map((a) => (
            <article key={a.id} className={`announcement ${a.read ? '' : 'is-unread'} ${a.pinned ? 'is-pinned' : ''}`}>
              <header>
                <div className="announcement-tags">
                  {a.pinned && (
                    <span className="pin-tag">
                      <Pin size={13} /> Fijada
                    </span>
                  )}
                  <OptionBadge value={a.category} map={ANNOUNCEMENT_CATEGORY} dot={false} />
                  {!a.read && <span className="new-tag">Nueva</span>}
                </div>
                <time title={formatDateTime(a.published_at)}>{timeAgo(a.published_at)}</time>
              </header>
              <h2>{a.title}</h2>
              <p className="pre-line">{a.body}</p>
              <footer>
                <span className="text-mute">Publicado por {a.author_name}</span>
                <Button size="sm" variant={a.read ? 'ghost' : 'secondary'} onClick={() => toggle(a)}>
                  {a.read ? 'Marcar como no leída' : 'Marcar como leída'}
                </Button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Bell size={24} />} title={filter === 'no_leidas' ? 'Estás al día' : 'Sin actualizaciones'}>
          Las novedades publicadas por la administración aparecerán aquí.
        </EmptyState>
      )}
    </div>
  );
}
