import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Hash, History, Repeat2, ShieldCheck, Unlink } from 'lucide-react';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { PhoneCheckTool } from '../../components/domain/PhoneCheck';
import { Badge, OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm, useToast } from '../../components/ui/Feedback';
import { FilterSelect } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Card, ChipTabs, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Toolbar } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { CONTACT_STATUS } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { useRealtime } from '../../hooks/useRealtime';
import { contactHistory, getContact, listAssignments, releaseContact } from '../../services/contacts';
import type { Assignment, Contact } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { contactTitle, formatDate, formatDateTime } from '../../utils/format';
import { formatPhone } from '../../utils/phone';
import { AssignModal } from './components/ContactModals';
import { useEmployeeOptions } from './components/useEmployeeOptions';

const PAGE_SIZE = 50;
type View = 'activas' | 'liberadas' | 'todas';

/**
 * Control de números: quién tiene cada número, desde cuándo y quién lo asignó.
 * Desde aquí se liberan o reasignan números y se consulta el historial completo.
 */
export function AdminNumbers() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { settings } = useWorkspace();
  const { options: employeeOptions } = useEmployeeOptions();

  const [phone, setPhone] = useState(params.get('q') ?? '');
  const debounced = useDebounce(phone);
  const view = (params.get('vista') ?? 'activas') as View;
  const employeeId = params.get('empleado') ?? '';
  const [page, setPage] = useState(0);
  const [reassigning, setReassigning] = useState<Contact[]>([]);
  const [historyFor, setHistoryFor] = useState<Contact | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(0);
  };

  const { data, loading, error, reload } = useAsync(
    () =>
      listAssignments({
        active: view === 'activas' ? true : view === 'liberadas' ? false : undefined,
        employeeId: employeeId || undefined,
        phone: debounced,
        page,
      }),
    [view, employeeId, debounced, page],
  );
  // Toda asignación o liberación cambia también el contacto, que sí emite eventos en vivo.
  useRealtime('contacts', () => void reload(true));

  const release = async (a: Assignment) => {
    const ok = await confirm({
      title: '¿Liberar este número?',
      message: `${formatPhone(a.phone, settings.default_country_code)} dejará de estar asignado a ${a.employee?.full_name ?? 'su responsable'}. Quedará sin responsable para asignarlo a otra persona.`,
      confirmLabel: 'Liberar número',
      danger: true,
    });
    if (!ok) return;
    try {
      await releaseContact(a.contact_id, 'Liberado desde Control de números');
      toast.success('Número liberado');
      void reload(true);
    } catch (err) {
      toast.error('No se pudo liberar', friendlyError(err));
    }
  };

  // Para reasignar o ver el historial se necesita el contacto completo.
  const withContact = async (a: Assignment, then: (c: Contact) => void) => {
    try {
      then(await getContact(a.contact_id));
    } catch (err) {
      toast.error('No se pudo abrir el contacto', friendlyError(err));
    }
  };

  const rows = data?.rows ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Control de números"
        subtitle="Cada número tiene un solo responsable. Aquí ves quién lo tiene, desde cuándo, y puedes liberarlo o reasignarlo."
      />

      <div className="two-col two-col-wide">
        <Card title={<><ShieldCheck size={16} /> Verificar un número</>}>
          <p className="text-mute small">Comprueba si un número ya está registrado o asignado antes de entregarlo a alguien.</p>
          <PhoneCheckTool staff />
        </Card>
        <Card title="Cómo funciona" className="card-subtle">
          <ul className="bullet-list small">
            <li>Al asignar un contacto se registra el número, el empleado, la fecha y quién lo asignó.</li>
            <li>Si otro empleado intenta registrar el mismo número, el sistema lo bloquea y le avisa.</li>
            <li>Liberar un número lo deja sin responsable; reasignarlo lo pasa directamente a otra persona.</li>
            <li>El historial conserva todas las asignaciones anteriores.</li>
          </ul>
        </Card>
      </div>

      <ChipTabs
        label="Vista"
        value={view}
        onChange={(v) => setParam('vista', v === 'activas' ? '' : v)}
        options={[
          { value: 'activas', label: 'Asignaciones activas' },
          { value: 'liberadas', label: 'Liberadas / historial' },
          { value: 'todas', label: 'Todas' },
        ]}
      />
      <Toolbar>
        <SearchInput
          value={phone}
          onChange={(v) => {
            setPhone(v);
            setPage(0);
          }}
          placeholder="Buscar por número (mínimo 3 dígitos)…"
        />
        <FilterSelect label="Empleado" value={employeeId} onChange={(v) => setParam('empleado', v)} options={employeeOptions} allLabel="Todos los empleados" />
      </Toolbar>

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : rows.length ? (
        <Card padded={false}>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Contacto</th>
                  <th>Empleado</th>
                  <th>Asignado</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const active = !a.released_at;
                  return (
                    <tr key={a.id}>
                      <td data-label="Número" className="mono">
                        <strong>{formatPhone(a.phone, settings.default_country_code)}</strong>
                      </td>
                      <td data-label="Contacto">
                        {a.contact ? (
                          <>
                            <span className="block">{contactTitle({ ...a.contact, phone: a.phone })}</span>
                            <OptionBadge value={a.contact.status} map={CONTACT_STATUS} />
                          </>
                        ) : (
                          <span className="text-mute">Contacto eliminado</span>
                        )}
                      </td>
                      <td data-label="Empleado">
                        <strong>{a.employee?.full_name ?? '—'}</strong>
                        {a.assigner && <span className="text-mute small block">Asignó: {a.assigner.full_name}</span>}
                      </td>
                      <td data-label="Asignado" className="text-mute" title={formatDateTime(a.assigned_at)}>
                        {formatDate(a.assigned_at)}
                      </td>
                      <td data-label="Estado">
                        {active ? (
                          <Badge tone="green" dot>
                            Activa
                          </Badge>
                        ) : (
                          <>
                            <Badge tone="muted">Liberada {formatDate(a.released_at)}</Badge>
                            {a.release_reason && <span className="text-mute small block">{a.release_reason}</span>}
                          </>
                        )}
                      </td>
                      <td className="cell-actions">
                        {active && a.contact && (
                          <>
                            <Button size="sm" variant="ghost" icon={<Repeat2 size={15} />} title="Reasignar" aria-label="Reasignar" onClick={() => withContact(a, (c) => setReassigning([c]))} />
                            <Button size="sm" variant="ghost" icon={<Unlink size={15} />} title="Liberar número" aria-label="Liberar número" onClick={() => release(a)} />
                          </>
                        )}
                        {a.contact && (
                          <Button size="sm" variant="ghost" icon={<History size={15} />} title="Historial" aria-label="Historial" onClick={() => withContact(a, setHistoryFor)} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} count={data?.count ?? 0} onPage={setPage} />
        </Card>
      ) : (
        <EmptyState icon={<Hash size={24} />} title={view === 'activas' ? 'No hay números asignados' : 'Sin registros'}>
          {view === 'activas' ? 'Asigna contactos desde la sección Contactos.' : 'Cambia los filtros para ver otras asignaciones.'}
        </EmptyState>
      )}

      <AssignModal
        contacts={reassigning}
        onClose={() => setReassigning([])}
        onDone={() => {
          setReassigning([]);
          void reload(true);
        }}
      />
      <NumberHistoryModal contact={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

/** Historial de asignaciones de un número (quién lo tuvo, cuándo y por qué se liberó). */
export function NumberHistoryModal({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const { settings } = useWorkspace();
  const { data, loading, error, reload } = useAsync(() => (contact ? contactHistory(contact.id) : Promise.resolve([])), [contact?.id]);

  return (
    <Modal
      open={!!contact}
      onClose={onClose}
      title="Historial del número"
      description={contact ? `${contactTitle(contact)} · ${formatPhone(contact.phone, settings.default_country_code)}` : undefined}
      footer={<Button onClick={onClose}>Cerrar</Button>}
    >
      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading ? (
        <SectionLoader />
      ) : data?.length ? (
        <ol className="timeline">
          {data.map((a) => (
            <li key={a.id} className={a.released_at ? '' : 'is-current'}>
              <span className="timeline-dot" aria-hidden="true" />
              <div>
                <strong>{a.employee?.full_name ?? 'Empleado eliminado'}</strong>
                {!a.released_at && (
                  <Badge tone="green" dot>
                    Actual
                  </Badge>
                )}
                <p className="text-mute small">
                  Asignado el {formatDateTime(a.assigned_at)}
                  {a.assigner ? ` por ${a.assigner.full_name}` : ''}
                </p>
                {a.released_at && (
                  <p className="text-mute small">
                    Liberado el {formatDateTime(a.released_at)}
                    {a.release_reason ? ` · ${a.release_reason}` : ''}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-mute">Este número nunca ha sido asignado.</p>
      )}
    </Modal>
  );
}
