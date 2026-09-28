import { useState } from 'react';
import { CheckCheck, Mail, MailOpen, MessageSquare } from 'lucide-react';
import { useProfile } from '../../auth/AuthProvider';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Feedback';
import { ChipTabs, EmptyState, ErrorState, PageHeader } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { AUDIENCE_LABEL } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { listInbox, markAllRead, markMessageRead } from '../../services/communications';
import type { InboxMessage } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { formatDate, formatTime } from '../../utils/format';

export function Communications() {
  const profile = useProfile();
  const toast = useToast();
  const { liveVersion, refreshSummary } = useWorkspace();
  const { data, loading, error, reload, setData } = useAsync(() => listInbox(profile.id), [profile.id, liveVersion]);
  const [filter, setFilter] = useState<'todos' | 'no_leidos'>('todos');
  const [openId, setOpenId] = useState<string | null>(null);

  const messages = data ?? [];
  const unread = messages.filter((m) => !m.read_at).length;
  const visible = filter === 'no_leidos' ? messages.filter((m) => !m.read_at) : messages;

  const setRead = async (m: InboxMessage, read: boolean) => {
    setData((list) => (list ?? []).map((x) => (x.id === m.id ? { ...x, read_at: read ? new Date().toISOString() : null } : x)));
    try {
      await markMessageRead(m.id, read);
      void refreshSummary();
    } catch (err) {
      toast.error('No se pudo actualizar', friendlyError(err));
      void reload(true);
    }
  };

  const toggleOpen = (m: InboxMessage) => {
    const opening = openId !== m.id;
    setOpenId(opening ? m.id : null);
    if (opening && !m.read_at) void setRead(m, true);
  };

  const readAll = async () => {
    try {
      await markAllRead('messages');
      setData((list) => (list ?? []).map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
      void refreshSummary();
    } catch (err) {
      toast.error('No se pudo actualizar', friendlyError(err));
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Comunicaciones"
        subtitle="Mensajes que te envía la administración."
        actions={
          unread > 0 && (
            <Button variant="ghost" icon={<CheckCheck size={16} />} onClick={readAll}>
              Marcar todo como leído
            </Button>
          )
        }
      />
      <ChipTabs
        label="Filtrar mensajes"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'todos', label: 'Todos', count: messages.length },
          { value: 'no_leidos', label: 'No leídos', count: unread },
        ]}
      />

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : visible.length ? (
        <ul className="message-list">
          {visible.map((m) => {
            const open = openId === m.id;
            return (
              <li key={m.id} className={`message-item ${m.read_at ? '' : 'is-unread'} ${open ? 'is-open' : ''}`}>
                <button type="button" className="message-summary" onClick={() => toggleOpen(m)} aria-expanded={open}>
                  <span className="message-icon">{m.read_at ? <MailOpen size={18} /> : <Mail size={18} />}</span>
                  <span className="message-main">
                    <span className="message-title">
                      {!m.read_at && <span className="unread-dot" aria-label="No leído" />}
                      {m.title}
                    </span>
                    <span className="message-meta">
                      De <strong>{m.sender_name}</strong> · {formatDate(m.created_at)} · {formatTime(m.created_at)}
                    </span>
                    {!open && <span className="message-preview">{m.body}</span>}
                  </span>
                  <Badge tone={m.audience === 'employee' ? 'gold' : 'neutral'}>{m.audience === 'employee' ? 'Para ti' : AUDIENCE_LABEL[m.audience]}</Badge>
                </button>
                {open && (
                  <div className="message-body">
                    <p className="pre-line">{m.body}</p>
                    <div className="message-actions">
                      <Button size="sm" variant="ghost" icon={<Mail size={15} />} onClick={() => setRead(m, false)}>
                        Marcar como no leído
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<MessageSquare size={24} />} title={filter === 'no_leidos' ? 'No tienes mensajes sin leer' : 'Aún no tienes mensajes'}>
          Aquí verás las comunicaciones del administrador.
        </EmptyState>
      )}
    </div>
  );
}
