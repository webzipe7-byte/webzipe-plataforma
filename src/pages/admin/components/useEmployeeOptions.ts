import { useAsync } from '../../../hooks/useAsync';
import { listActiveEmployees } from '../../../services/employees';

/** Empleados activos para selectores (asignar tareas, contactos, mensajes). */
export function useEmployeeOptions() {
  const { data } = useAsync(listActiveEmployees, []);
  const employees = data ?? [];
  return {
    employees,
    options: employees.map((e) => ({ value: e.id, label: e.full_name })),
    byId: (id: string | null | undefined) => employees.find((e) => e.id === id),
  };
}
