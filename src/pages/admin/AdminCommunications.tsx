import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, MessageSquare, Pencil, Plus, Send, Trash2, Users, UsersRound } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm, useToast } from '../../components/ui/Feedback';
import { SelectField, TextArea, TextField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Card, ChipTabs, EmptyState, ErrorState, PageHeader, Pagination, SearchInput } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { AUDIENCE_LABEL } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { deleteGroup, listGroups, listSentMessages, saveGroup, sendMessage } from '../../services/communications';
import type { EmployeeGroup, MessageAudience, SentMessage } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { formatDate, formatTime, plural } from '../../utils/format';
import { useEmployeeOptions } from './components/useEmployeeOptions';

const PAGE_SIZE = 30;

export function AdminCommunications() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'enviar' | 'grupos'>('enviar');
  const [page, setPage] = useState(0);
  const groups = useAsync(listGroups, []);
  const sent = useAsync(() => listSentMessages(page), [page]);
  const { byId } = useEmployeeOptions();
  const nameOf = (id: string) => byId(id)?.full_name ?? 'Empleado inactivo';

  return (
    <div className="page">
      <PageHeader title="Comunicaciones" subtitle="Envía mensajes a todo el equipo, a un grupo o a un empleado. Ellos reciben una notificación en su portal." />

      <ChipTabs
        label="Sección"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'enviar', label: 'Mensajes' },
          { value: 'grupos', label: 'Grupos de empleados', count: groups.data?.length },
        ]}
      />

      {tab === 'enviar' ? (
        <div className="dashboard-grid">
          <div className="dashboard-main">
            <Card title="Mensajes enviados" padded={false}>
              {sent.error && <ErrorState message={sent.error} onRetry={() => sent.reload()} />}
              {sent.loading && !sent.data ? (
                <div className="pad">
                  <SectionLoader />
                </div>
              ) : sent.data?.rows.length ? (
                <>
                  <ul className="sent-list">
                    {sent.data.rows.map((m) => (
                      <SentMessageRow key={m.id} message={m} nameOf={nameOf} />
                    ))}
                  </ul>
                  <Pagination page={page} pageSize={PAGE_SIZE} count={sent.data.count} onPage={setPage} />
                </>
              ) : (
                <EmptyState icon={<MessageSquare size={24} />} title="Aún no has enviado mensajes">
                  Escribe el primero desde el formulario.
                </EmptyState>
              )}
            </Card>
          </div>
          <div className="dashboard-side">
            <ComposeCard
              groups={groups.data ?? []}
              initialEmployee={params.get('para') ?? ''}
              onSent={() => {
                setPage(0);
                void sent.reload(true);
              }}
            />
          </div>
        </div>
      ) : (
        <GroupsPanel groups={groups.data ?? []} loading={groups.loading && !groups.data} error={groups.error} reload={() => groups.reload(true)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Redactar
// ---------------------------------------------------------------------
function ComposeCard({ groups, initialEmployee, onSent }: { groups: EmployeeGroup[]; initialEmployee: string; onSent: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { options, byId } = useEmployeeOptions();
  const [audience, setAudience] = useState<MessageAudience>(initialEmployee ? 'employee' : 'all');
  const [employeeId, setEmployeeId] = useState(initialEmployee);
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialEmployee) {
      setAudience('employee');
      setEmployeeId(initialEmployee);
    }
  }, [initialEmployee]);

  const targetLabel =
    audience === 'all'
      ? 'todos los empleados activos'
      : audience === 'group'
        ? `el grupo «${groups.find((g) => g.id === groupId)?.name ?? '…'}»`
        : (byId(employeeId)?.full_name ?? '…');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 2) return setError('Escribe un título (mínimo 2 caracteres).');
    if (!body.trim()) return setError('Escribe el mensaje.');
    if (audience === 'group' && !groupId) return setError('Selecciona un grupo.');
    if (audience === 'employee' && !employeeId) return setError('Selecciona un empleado.');
    if (audience === 'all' && !(await confirm({ title: '¿Enviar a todo el equipo?', message: `«${title.trim()}» llegará a todos los empleados activos.`, confirmLabel: 'Enviar' }))) return;

    setSending(true);
    try {
      const res = await sendMessage({ title: title.trim(), body: body.trim(), audience, groupId, employeeId });
      toast.success('Mensaje enviado', `Lo recibieron ${plural(res.recipients, 'persona', 'personas')}.`);
      setTitle('');
      setBody('');
      onSent();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title={<><Send size={16} /> Nuevo mensaje</>} className="card-gold">
      <form className="form-stack" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="segmented" role="radiogroup" aria-label="Destinatarios">
          {(['all', 'group', 'employee'] as MessageAudience[]).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={audience === a} className={audience === a ? 'is-active' : ''} onClick={() => setAudience(a)}>
              {a === 'all' ? 'Todos' : a === 'group' ? 'Grupo' : 'Un empleado'}
            </button>
          ))}
        </div>
        {audience === 'group' && (
          <SelectField
            label="Grupo"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            placeholder={groups.length ? 'Selecciona…' : 'Primero crea un grupo'}
            options={groups.map((g) => ({ value: g.id, label: `${g.name} (${g.members.length})` }))}
          />
        )}
        {audience === 'employee' && <SelectField label="Empleado" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Selecciona…" options={options} />}
        <TextField label="Título" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ej. Nueva lista de números para hoy" />
        <TextArea label="Mensaje" required value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={5000} />
        <p className="text-mute small">Se enviará a {targetLabel}.</p>
        <Button type="submit" variant="primary" icon={<Send size={16} />} loading={sending} block>
          Enviar mensaje
        </Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Mensaje enviado (con estado de lectura)
// ---------------------------------------------------------------------
function SentMessageRow({ message: m, nameOf }: { message: SentMessage; nameOf: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const read = m.recipients.filter((r) => r.read_at).length;
  const total = m.recipients.length;
  const target = m.audience === 'all' ? AUDIENCE_LABEL.all : m.audience === 'group' ? `Grupo: ${m.group?.name ?? '—'}` : (m.target?.full_name ?? 'Empleado');

  return (
    <li className={`sent-item ${open ? 'is-open' : ''}`}>
      <button type="button" className="sent-summary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="sent-main">
          <strong>{m.title}</strong>
          <span className="text-mute small">
            Para {target} · {formatDate(m.created_at)}, {formatTime(m.created_at)} · {m.sender_name}
          </span>
        </span>
        <Badge tone={read === total ? 'green' : read ? 'blue' : 'neutral'}>
          <Eye size={13} /> {read}/{total} leído
        </Badge>
      </button>
      {open && (
        <div className="sent-body">
          <p className="pre-line">{m.body}</p>
          <div className="read-receipts">
            {m.recipients.map((r) => (
              <span key={r.employee_id} className={`receipt ${r.read_at ? 'is-read' : ''}`} title={r.read_at ? `Leído ${formatDate(r.read_at)} ${formatTime(r.read_at)}` : 'Sin leer'}>
                {nameOf(r.employee_id)}
              </span>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------
function GroupsPanel({ groups, loading, error, reload }: { groups: EmployeeGroup[]; loading: boolean; error: string | null; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { byId } = useEmployeeOptions();
  const [editing, setEditing] = useState<EmployeeGroup | 'new' | null>(null);

  const remove = async (g: EmployeeGroup) => {
    if (!(await confirm({ title: `¿Eliminar el grupo «${g.name}»?`, message: 'Los mensajes ya enviados se conservan.', confirmLabel: 'Eliminar', danger: true }))) return;
    try {
      await deleteGroup(g.id);
      toast.success('Grupo eliminado');
      reload();
    } catch (err) {
      toast.error('No se pudo eliminar', friendlyError(err));
    }
  };

  return (
    <>
      <div className="section-bar">
        <p className="text-mute">Agrupa empleados (por campaña, ciudad o turno) para enviarles mensajes a todos a la vez.</p>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>
          Nuevo grupo
        </Button>
      </div>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading ? (
        <SectionLoader />
      ) : groups.length ? (
        <div className="card-grid">
          {groups.map((g) => (
            <Card
              key={g.id}
              title={<><UsersRound size={16} /> {g.name}</>}
              action={
                <>
                  <Button size="sm" variant="ghost" icon={<Pencil size={15} />} aria-label="Editar grupo" title="Editar" onClick={() => setEditing(g)} />
                  <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label="Eliminar grupo" title="Eliminar" onClick={() => remove(g)} />
                </>
              }
            >
              {g.description && <p className="text-mute small">{g.description}</p>}
              <div className="badge-row">
                {g.members.length ? (
                  g.members.map((m) => (
                    <Badge key={m.employee_id} tone="neutral">
                      {byId(m.employee_id)?.full_name ?? 'Inactivo'}
                    </Badge>
                  ))
                ) : (
                  <span className="text-mute small">Sin miembros</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users size={24} />} title="No hay grupos" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>Crear grupo</Button>}>
          Crea grupos para enviar mensajes a varias personas.
        </EmptyState>
      )}
      <GroupModal
        group={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          toast.success('Grupo guardado');
          reload();
        }}
      />
    </>
  );
}

function GroupModal({ group, onClose, onSaved }: { group: EmployeeGroup | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const { employees } = useEmployeeOptions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group) return;
    const g = group === 'new' ? null : group;
    setName(g?.name ?? '');
    setDescription(g?.description ?? '');
    setMembers(new Set(g?.members.map((m) => m.employee_id) ?? []));
    setFilter('');
    setError(null);
  }, [group]);

  const visible = useMemo(() => employees.filter((e) => e.full_name.toLowerCase().includes(filter.toLowerCase())), [employees, filter]);

  const toggle = (id: string) =>
    setMembers((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Escribe un nombre para el grupo.');
    setSaving(true);
    setError(null);
    try {
      await saveGroup({ id: group === 'new' ? undefined : group?.id, name: name.trim(), description: description.trim() || null }, [...members]);
      onSaved();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      busy={saving}
      title={group === 'new' ? 'Nuevo grupo' : 'Editar grupo'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="group-form" loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="group-form" className="form-stack" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error">{error}</div>}
        <TextField label="Nombre" required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej. Equipo Pasto" />
        <TextField label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        <div className="field">
          <span className="field-label">Miembros ({members.size})</span>
          <SearchInput value={filter} onChange={setFilter} placeholder="Filtrar empleados…" />
          <div className="check-list">
            {visible.map((e) => (
              <label key={e.id} className="checkbox-row">
                <input type="checkbox" checked={members.has(e.id)} onChange={() => toggle(e.id)} />
                <span>{e.full_name}</span>
              </label>
            ))}
            {!visible.length && <p className="text-mute small">Sin coincidencias.</p>}
          </div>
        </div>
      </form>
    </Modal>
  );
}
