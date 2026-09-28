import { supabase } from '../lib/supabase';
import type { Task, TaskPriority, TaskStatus } from '../types/database';
import { unwrap } from '../utils/errors';
import { todayISO } from '../utils/format';
import { orSearch } from '../utils/search';

const TASK_SELECT = '*, assignee:employees!tasks_assigned_to_fkey (id, full_name)';

export type TaskFilters = {
  search?: string;
  status?: TaskStatus | 'activas' | '';
  employeeId?: string;
  priority?: TaskPriority | '';
  overdue?: boolean;
  sort?: 'due' | 'recent' | 'priority' | 'completed';
  page?: number;
  pageSize?: number;
};

export type TaskInput = {
  title: string;
  description?: string | null;
  contact_id?: string | null;
  phone?: string | null;
  client_name?: string | null;
  assigned_to: string;
  due_date?: string | null;
  priority: TaskPriority;
  status?: TaskStatus;
};

export async function listTasks(filters: TaskFilters = {}): Promise<{ rows: Task[]; count: number }> {
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;
  let q = supabase.from('tasks').select(TASK_SELECT, { count: 'exact' });

  const or = filters.search ? orSearch(filters.search, ['title', 'client_name', 'description'], ['phone']) : null;
  if (or) q = q.or(or);
  if (filters.status === 'activas') q = q.neq('status', 'completada');
  else if (filters.status) q = q.eq('status', filters.status);
  if (filters.employeeId) q = q.eq('assigned_to', filters.employeeId);
  if (filters.priority) q = q.eq('priority', filters.priority);
  if (filters.overdue) q = q.neq('status', 'completada').lt('due_date', todayISO());

  switch (filters.sort) {
    case 'recent':
      q = q.order('assigned_at', { ascending: false });
      break;
    case 'completed':
      q = q.order('completed_at', { ascending: false, nullsFirst: false });
      break;
    case 'priority':
      // el orden del enum es baja < media < alta < urgente
      q = q.order('priority', { ascending: false }).order('due_date', { ascending: true, nullsFirst: false });
      break;
    default:
      q = q.order('due_date', { ascending: true, nullsFirst: false }).order('priority', { ascending: false });
  }

  const res = await q.range(page * pageSize, page * pageSize + pageSize - 1);
  const rows = unwrap(res) as Task[];
  return { rows, count: res.count ?? rows.length };
}

/** Tareas del usuario actual (RLS garantiza que solo vea las suyas). */
export async function listMyTasks(): Promise<Task[]> {
  return unwrap(
    await supabase.from('tasks').select('*').order('status').order('due_date', { ascending: true, nullsFirst: false }).limit(500),
  ) as Task[];
}

export async function createTask(input: TaskInput): Promise<Task> {
  return unwrap(await supabase.from('tasks').insert(input).select(TASK_SELECT).single()) as Task;
}

export async function updateTask(id: string, input: Partial<TaskInput>): Promise<Task> {
  return unwrap(await supabase.from('tasks').update(input).eq('id', id).select(TASK_SELECT).single()) as Task;
}

export async function deleteTask(id: string): Promise<void> {
  unwrap(await supabase.from('tasks').delete().eq('id', id));
}

export async function updateTaskStatus(id: string, status: TaskStatus, note?: string | null): Promise<void> {
  unwrap(await supabase.rpc('update_task_status', { p_task_id: id, p_status: status, p_note: note ?? null }));
}

/** ¿Existe ya una tarea abierta igual para ese empleado? (para advertir duplicados) */
export async function findOpenDuplicate(title: string, employeeId: string, excludeId?: string): Promise<Task | null> {
  let q = supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', employeeId)
    .neq('status', 'completada')
    .ilike('title', title.trim().replace(/[%_\\]/g, (c) => `\\${c}`));
  if (excludeId) q = q.neq('id', excludeId);
  const rows = unwrap(await q.limit(1)) as Task[];
  return rows[0] ?? null;
}
