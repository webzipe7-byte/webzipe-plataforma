import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActivityFeed } from '../../components/domain/ActivityFeed';
import { FilterSelect } from '../../components/ui/Field';
import { Card, ErrorState, PageHeader, Pagination, SearchInput, Toolbar } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { ACTIVITY_ACTIONS } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { listActivity } from '../../services/admin';
import { useEmployeeOptions } from './components/useEmployeeOptions';

const PAGE_SIZE = 40;
const ACTION_OPTIONS = Object.entries(ACTIVITY_ACTIONS).map(([value, a]) => ({ value, label: a.label }));

/** Historial completo de lo que ocurre en el sistema (solo lectura: nadie puede editarlo desde la aplicación). */
export function AdminActivity() {
  const [params, setParams] = useSearchParams();
  const { options: employeeOptions } = useEmployeeOptions();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const action = params.get('accion') ?? '';
  const employeeId = params.get('empleado') ?? '';
  const from = params.get('desde') ?? '';
  const to = params.get('hasta') ?? '';
  const [page, setPage] = useState(0);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(0);
  };

  const { data, loading, error, reload } = useAsync(
    () => listActivity({ action, employeeId, search: debounced, from, to, page, pageSize: PAGE_SIZE }),
    [action, employeeId, debounced, from, to, page],
  );

  return (
    <div className="page">
      <PageHeader title="Actividad" subtitle="Registro de todo lo que ocurre: inicios de sesión, asignaciones, tareas completadas, mensajes y más." />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Buscar en la descripción (nombre, número…)"
        />
        <FilterSelect label="Tipo de acción" value={action} onChange={(v) => setParam('accion', v)} options={ACTION_OPTIONS} allLabel="Todas las acciones" />
        <FilterSelect label="Empleado" value={employeeId} onChange={(v) => setParam('empleado', v)} options={employeeOptions} allLabel="Todos los empleados" />
        <label className="date-filter">
          <span>Desde</span>
          <input type="date" className="input input-sm" value={from} max={to || undefined} onChange={(e) => setParam('desde', e.target.value)} />
        </label>
        <label className="date-filter">
          <span>Hasta</span>
          <input type="date" className="input input-sm" value={to} min={from || undefined} onChange={(e) => setParam('hasta', e.target.value)} />
        </label>
      </Toolbar>

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : (
        <Card>
          <ActivityFeed items={data?.rows ?? []} />
          <Pagination page={page} pageSize={PAGE_SIZE} count={data?.count ?? 0} onPage={setPage} />
        </Card>
      )}
    </div>
  );
}
