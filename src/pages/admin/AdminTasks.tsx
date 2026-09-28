import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm, useToast } from '../../components/ui/Feedback';
import { FilterSelect } from '../../components/ui/Field';
import { Card, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Toolbar } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { TASK_PRIORITY, TASK_PRIORITY_OPTIONS, TASK_STATUS, TASK_STATUS_OPTIONS } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { useRealtime } from '../../hooks/useRealtime';
import { deleteTask, listTasks, updateTaskStatus, type TaskFilters } from '../../services/tasks';
import type { Task, TaskPriority, TaskStatus } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { dueLabel, formatDate, formatDateTime, isOverdue } from '../../utils/format';
import { formatPhone } from '../../utils/phone';
import { TaskFormModal } from './components/TaskFormModal';
import { useEmployeeOptions } from './components/useEmployeeOptions';

const PAGE_SIZE = 50;

export function AdminTasks() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { settings } = useWorkspace();
  const { options: employeeOptions } = useEmployeeOptions();

  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounce(search);
  const status = (params.get('estado') ?? 'activas') as TaskFilters['status'];
  const employeeId = params.get('empleado') ?? '';
  const priority = (params.get('prioridad') ?? '') as TaskPriority | '';
  const overdue = params.get('vencidas') === '1';
  const sort = (params.get('orden') ?? (status === 'completada' ? 'completed' : 'due')) as TaskFilters['sort'];
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(0);
  };

  const { data, loading, error, reload, setData } = useAsync(
    () => listTasks({ search: debounced, status, employeeId, priority, overdue, sort, page, pageSize: PAGE_SIZE }),
    [debounced, status, employeeId, priority, overdue, sort, page],
  );
  useRealtime('tasks', () => void reload(true));

  const changeStatus = async (task: Task, next: TaskStatus) => {
    try {
      await updateTaskStatus(task.id, next);
      setData((d) => (d ? { ...d, rows: d.rows.map((t) => (t.id === task.id ? { ...t, status: next } : t)) } : d));
      toast.success('Estado actualizado');
    } catch (err) {
      toast.error('No se pudo actualizar', friendlyError(err));
    }
  };

  const remove = async (task: Task) => {
    const ok = await confirm({
      title: '¿Eliminar esta tarea?',
      message: `«${task.title}» desaparecerá para ${task.assignee?.full_name ?? 'el empleado'}. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteTask(task.id);
      toast.success('Tarea eliminada');
      void reload(true);
    } catch (err) {
      toast.error('No se pudo eliminar', friendlyError(err));
    }
  };

  const rows = data?.rows ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Tareas"
        subtitle="Asigna actividades y sigue su avance. Los empleados actualizan el estado desde su portal."
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Nueva tarea
          </Button>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Buscar por tarea, cliente o teléfono…" />
        <FilterSelect
          label="Estado"
          value={status ?? ''}
          onChange={(v) => setParam('estado', v)}
          allLabel="Todos los estados"
          options={[{ value: 'activas', label: 'Activas (no completadas)' }, ...TASK_STATUS_OPTIONS]}
        />
        <FilterSelect label="Empleado" value={employeeId} onChange={(v) => setParam('empleado', v)} options={employeeOptions} allLabel="Todos los empleados" />
        <FilterSelect label="Prioridad" value={priority} onChange={(v) => setParam('prioridad', v)} options={TASK_PRIORITY_OPTIONS} allLabel="Toda prioridad" />
        <FilterSelect
          label="Ordenar"
          value={sort ?? 'due'}
          onChange={(v) => setParam('orden', v)}
          allLabel={null}
          options={[
            { value: 'due', label: 'Fecha límite' },
            { value: 'priority', label: 'Prioridad' },
            { value: 'recent', label: 'Más recientes' },
            { value: 'completed', label: 'Completadas recientes' },
          ]}
        />
        <label className="checkbox-inline">
          <input type="checkbox" checked={overdue} onChange={(e) => setParam('vencidas', e.target.checked ? '1' : '')} /> Solo vencidas
        </label>
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
                  <th>Tarea</th>
                  <th>Empleado</th>
                  <th>Cliente</th>
                  <th>Prioridad</th>
                  <th>Fecha límite</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={isOverdue(t.due_date, t.status) ? 'row-overdue' : ''}>
                    <td data-label="Tarea">
                      <strong>{t.title}</strong>
                      <span className="text-mute small block">Asignada {formatDate(t.assigned_at)}</span>
                      {t.employee_note && (
                        <span className="task-note small">
                          <MessageSquareText size={13} /> {t.employee_note}
                        </span>
                      )}
                    </td>
                    <td data-label="Empleado">{t.assignee?.full_name ?? '—'}</td>
                    <td data-label="Cliente" className="small">
                      {t.client_name ?? '—'}
                      {t.phone && <span className="text-mute mono block">{formatPhone(t.phone, settings.default_country_code)}</span>}
                    </td>
                    <td data-label="Prioridad">
                      <OptionBadge value={t.priority} map={TASK_PRIORITY} dot={false} />
                    </td>
                    <td data-label="Fecha límite" className={isOverdue(t.due_date, t.status) ? 'text-danger' : 'text-mute'}>
                      {t.status === 'completada' ? (
                        <span title={formatDateTime(t.completed_at)}>Hecha {formatDate(t.completed_at)}</span>
                      ) : (
                        dueLabel(t.due_date)
                      )}
                    </td>
                    <td data-label="Estado">
                      <select
                        className={`input select input-sm status-pill tone-${TASK_STATUS[t.status].tone}`}
                        value={t.status}
                        aria-label="Estado de la tarea"
                        onChange={(e) => changeStatus(t, e.target.value as TaskStatus)}
                      >
                        {TASK_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="cell-actions">
                      <Button size="sm" variant="ghost" icon={<Pencil size={15} />} aria-label="Editar" title="Editar" onClick={() => { setEditing(t); setFormOpen(true); }} />
                      <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label="Eliminar" title="Eliminar" onClick={() => remove(t)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} count={data?.count ?? 0} onPage={setPage} />
        </Card>
      ) : (
        <EmptyState icon={<ClipboardList size={24} />} title="No hay tareas con esos filtros">
          Crea una tarea nueva o cambia los filtros.
        </EmptyState>
      )}

      <TaskFormModal
        open={formOpen}
        task={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          toast.success(editing ? 'Tarea actualizada' : 'Tarea asignada');
          void reload(true);
        }}
      />
    </div>
  );
}
