import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Contact2, History, Pencil, Plus, Trash2, Unlink, Upload, UserCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm, useToast } from '../../components/ui/Feedback';
import { FilterSelect } from '../../components/ui/Field';
import { Card, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Toolbar } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { CONTACT_STATUS, CONTACT_STATUS_OPTIONS } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { deleteContact, listContacts, releaseContact, type ContactFilters } from '../../services/contacts';
import type { Contact, ContactStatus } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { contactTitle, formatDate } from '../../utils/format';
import { formatPhone } from '../../utils/phone';
import { AssignModal, ContactFormModal, ImportModal } from './components/ContactModals';
import { TaskFormModal } from './components/TaskFormModal';
import { useEmployeeOptions } from './components/useEmployeeOptions';
import { NumberHistoryModal } from './AdminNumbers';

const PAGE_SIZE = 50;

export function AdminContacts() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { settings } = useWorkspace();
  const { options: employeeOptions } = useEmployeeOptions();

  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounce(search);
  const status = (params.get('estado') ?? '') as ContactStatus | '';
  const employeeId = params.get('empleado') ?? '';
  const category = params.get('categoria') ?? '';
  const sort = (params.get('orden') ?? 'recent') as ContactFilters['sort'];
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [assigning, setAssigning] = useState<Contact[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [taskFor, setTaskFor] = useState<Contact | null>(null);
  const [historyFor, setHistoryFor] = useState<Contact | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(0);
    setSelected(new Set());
  };

  const { data, loading, error, reload } = useAsync(
    () => listContacts({ search: debounced, status, employeeId, category, sort, page, pageSize: PAGE_SIZE }),
    [debounced, status, employeeId, category, sort, page],
  );
  const rows = data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const release = async (c: Contact) => {
    const ok = await confirm({
      title: '¿Liberar este número?',
      message: `${contactTitle(c)} dejará de estar asignado a ${c.assignee?.full_name}. Quedará sin responsable para reasignarlo.`,
      confirmLabel: 'Liberar',
      danger: true,
    });
    if (!ok) return;
    try {
      await releaseContact(c.id, 'Liberado desde Contactos');
      toast.success('Número liberado');
      void reload(true);
    } catch (err) {
      toast.error('No se pudo liberar', friendlyError(err));
    }
  };

  const remove = async (c: Contact) => {
    const ok = await confirm({
      title: '¿Eliminar este contacto?',
      message: `Se borrará ${contactTitle(c)} y su historial de asignaciones. Si solo quieres dejar de trabajarlo, cambia su estado a «No contactar».`,
      confirmLabel: 'Eliminar definitivamente',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteContact(c.id);
      toast.success('Contacto eliminado');
      void reload(true);
    } catch (err) {
      toast.error('No se pudo eliminar', friendlyError(err));
    }
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));

  return (
    <div className="page">
      <PageHeader
        title="Contactos"
        subtitle="Clientes y prospectos. Cada número existe una sola vez y tiene un único responsable."
        actions={
          <>
            <Button variant="secondary" icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>
              Importar
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Nuevo contacto
            </Button>
          </>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Buscar por nombre, empresa, ciudad o teléfono…" />
        <FilterSelect label="Estado" value={status} onChange={(v) => setParam('estado', v)} options={CONTACT_STATUS_OPTIONS} allLabel="Todos los estados" />
        <FilterSelect label="Empleado" value={employeeId} onChange={(v) => setParam('empleado', v)} options={[{ value: 'none', label: '— Sin asignar —' }, ...employeeOptions]} allLabel="Todos los responsables" />
        <FilterSelect label="Categoría" value={category} onChange={(v) => setParam('categoria', v)} options={settings.contact_categories.map((c) => ({ value: c, label: c }))} allLabel="Todas las categorías" />
        <FilterSelect
          label="Ordenar"
          value={sort ?? 'recent'}
          onChange={(v) => setParam('orden', v)}
          allLabel={null}
          options={[
            { value: 'recent', label: 'Más recientes' },
            { value: 'updated', label: 'Actualizados' },
            { value: 'assigned', label: 'Asignación reciente' },
            { value: 'name', label: 'Empresa (A–Z)' },
          ]}
        />
      </Toolbar>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>
            <strong>{selected.size}</strong> seleccionados
          </span>
          <Button size="sm" variant="primary" icon={<UserCheck size={15} />} onClick={() => setAssigning(selectedRows)}>
            Asignar a…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : rows.length ? (
        <Card padded={false}>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead>
                <tr>
                  <th className="cell-check">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    />
                  </th>
                  <th>Contacto</th>
                  <th>Teléfono</th>
                  <th>Categoría / ciudad</th>
                  <th>Estado</th>
                  <th>Responsable</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={selected.has(c.id) ? 'is-selected' : ''}>
                    <td className="cell-check">
                      <input type="checkbox" aria-label={`Seleccionar ${contactTitle(c)}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td data-label="Contacto">
                      <strong>{contactTitle(c)}</strong>
                      {c.business && c.name && <span className="text-mute small block">{c.name}</span>}
                      {c.notes && <span className="text-mute small block clamp-1">{c.notes}</span>}
                    </td>
                    <td data-label="Teléfono" className="mono">
                      {formatPhone(c.phone, settings.default_country_code)}
                    </td>
                    <td data-label="Categoría / ciudad" className="small">
                      {c.category ?? '—'}
                      {c.city && <span className="text-mute block">{c.city}</span>}
                    </td>
                    <td data-label="Estado">
                      <OptionBadge value={c.status} map={CONTACT_STATUS} />
                    </td>
                    <td data-label="Responsable">
                      {c.assignee ? (
                        <>
                          {c.assignee.full_name}
                          <span className="text-mute small block">desde {formatDate(c.assigned_at)}</span>
                        </>
                      ) : (
                        <span className="text-mute">Sin asignar</span>
                      )}
                    </td>
                    <td className="cell-actions">
                      <Button size="sm" variant={c.assigned_to ? 'ghost' : 'secondary'} icon={<UserCheck size={15} />} onClick={() => setAssigning([c])} title={c.assigned_to ? 'Reasignar' : 'Asignar'}>
                        {c.assigned_to ? undefined : 'Asignar'}
                      </Button>
                      {c.assigned_to && <Button size="sm" variant="ghost" icon={<Unlink size={15} />} onClick={() => release(c)} title="Liberar número" aria-label="Liberar número" />}
                      <Button size="sm" variant="ghost" icon={<ClipboardList size={15} />} onClick={() => setTaskFor(c)} title="Crear tarea" aria-label="Crear tarea" />
                      <Button size="sm" variant="ghost" icon={<History size={15} />} onClick={() => setHistoryFor(c)} title="Historial" aria-label="Historial" />
                      <Button size="sm" variant="ghost" icon={<Pencil size={15} />} onClick={() => { setEditing(c); setFormOpen(true); }} title="Editar" aria-label="Editar" />
                      {isAdmin && <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => remove(c)} title="Eliminar" aria-label="Eliminar" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} count={data?.count ?? 0} onPage={(p) => { setPage(p); setSelected(new Set()); }} />
        </Card>
      ) : (
        <EmptyState
          icon={<Contact2 size={24} />}
          title="No hay contactos con esos filtros"
          action={
            <Button variant="primary" icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>
              Importar números
            </Button>
          }
        />
      )}

      <ContactFormModal
        open={formOpen}
        contact={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          toast.success(editing ? 'Contacto actualizado' : 'Contacto creado');
          void reload(true);
        }}
      />
      <AssignModal
        contacts={assigning}
        onClose={() => setAssigning([])}
        onDone={() => {
          setAssigning([]);
          setSelected(new Set());
          void reload(true);
        }}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={() => void reload(true)} />
      <TaskFormModal
        open={!!taskFor}
        defaults={{ contact: taskFor, assigned_to: taskFor?.assigned_to ?? undefined }}
        onClose={() => setTaskFor(null)}
        onSaved={() => {
          setTaskFor(null);
          toast.success('Tarea asignada');
        }}
      />
      <NumberHistoryModal contact={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}
