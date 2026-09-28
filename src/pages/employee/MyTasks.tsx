import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { TaskCard } from '../../components/domain/TaskCard';
import { useToast } from '../../components/ui/Feedback';
import { ChipTabs, EmptyState, ErrorState, PageHeader, SearchInput } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { TASK_STATUS } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { listMyTasks, updateTaskStatus } from '../../services/tasks';
import type { Task, TaskStatus } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { isOverdue } from '../../utils/format';
import { sortActiveTasks } from './EmployeeHome';

type Filter = 'activas' | TaskStatus | 'vencidas' | 'todas';

export function MyTasks() {
  const toast = useToast();
  const { liveVersion, refreshSummary } = useWorkspace();
  const { data, loading, error, reload, setData } = useAsync(listMyTasks, [liveVersion]);
  const [filter, setFilter] = useState<Filter>('activas');
  const [search, setSearch] = useState('');

  const tasks = data ?? [];
  const counts = useMemo(
    () => ({
      activas: tasks.filter((t) => t.status !== 'completada').length,
      vencidas: tasks.filter((t) => isOverdue(t.due_date, t.status)).length,
      pendiente: tasks.filter((t) => t.status === 'pendiente').length,
      en_proceso: tasks.filter((t) => t.status === 'en_proceso').length,
      pausada: tasks.filter((t) => t.status === 'pausada').length,
      completada: tasks.filter((t) => t.status === 'completada').length,
      todas: tasks.length,
    }),
    [tasks],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tasks.filter((t) => {
      if (filter === 'activas') return t.status !== 'completada';
      if (filter === 'vencidas') return isOverdue(t.due_date, t.status);
      if (filter === 'todas') return true;
      return t.status === filter;
    });
    if (q) {
      list = list.filter((t) => [t.title, t.description, t.client_name, t.phone].some((v) => v?.toLowerCase().includes(q)));
    }
    if (filter === 'completada') return list.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    const active = sortActiveTasks(list);
    return filter === 'todas' ? [...active, ...list.filter((t) => t.status === 'completada')] : active;
  }, [tasks, filter, search]);

  const onStatus = async (task: Task, status: TaskStatus, note?: string | null) => {
    try {
      await updateTaskStatus(task.id, status, note);
      const now = new Date().toISOString();
      setData((list) =>
        (list ?? []).map((t) =>
          t.id === task.id
            ? { ...t, status, employee_note: note ?? t.employee_note, completed_at: status === 'completada' ? now : null, updated_at: now }
            : t,
        ),
      );
      toast.success(
        status === 'completada' ? '¡Tarea completada!' : `Tarea marcada como ${TASK_STATUS[status].label.toLowerCase()}`,
        status === 'completada' ? 'El administrador ya puede verla como terminada.' : undefined,
      );
      void refreshSummary();
    } catch (err) {
      toast.error('No se pudo actualizar la tarea', friendlyError(err));
      throw err;
    }
  };

  return (
    <div className="page">
      <PageHeader title="Mis tareas" subtitle="Actividades que te asignó el administrador. Actualiza su estado a medida que avanzas." />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar tarea, cliente o número…" />
      </div>
      <ChipTabs
        label="Filtrar tareas"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'activas', label: 'Activas', count: counts.activas },
          { value: 'vencidas', label: 'Vencidas', count: counts.vencidas },
          { value: 'pendiente', label: 'Pendientes', count: counts.pendiente },
          { value: 'en_proceso', label: 'En proceso', count: counts.en_proceso },
          { value: 'pausada', label: 'Pausadas', count: counts.pausada },
          { value: 'completada', label: 'Completadas', count: counts.completada },
          { value: 'todas', label: 'Todas', count: counts.todas },
        ]}
      />

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : visible.length ? (
        <div className="card-grid">
          {visible.map((t) => (
            <TaskCard key={t.id} task={t} onStatus={onStatus} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<ClipboardList size={24} />} title={search ? 'Sin resultados' : 'No hay tareas aquí'}>
          {search ? 'Prueba con otra búsqueda.' : filter === 'activas' ? 'No tienes tareas activas en este momento.' : 'Cambia el filtro para ver otras tareas.'}
        </EmptyState>
      )}
    </div>
  );
}
