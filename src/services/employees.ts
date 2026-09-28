import { appBaseUrl } from '../config/env';
import { supabase } from '../lib/supabase';
import type { Employee, EmployeeStatus, Role, WorkloadRow } from '../types/database';
import { unwrap } from '../utils/errors';
import { orSearch } from '../utils/search';
import { callFunction } from './functions';

export type EmployeeInput = {
  full_name: string;
  username: string;
  email: string;
  phone?: string | null;
  role: Role;
  hire_date?: string | null;
  notes?: string | null;
};

export type EmployeeFilters = {
  search?: string;
  role?: Role | '';
  status?: EmployeeStatus | '';
  sort?: 'name' | 'recent' | 'activity';
};

export async function listEmployees(filters: EmployeeFilters = {}): Promise<Employee[]> {
  let q = supabase.from('employees').select('*');
  const or = filters.search ? orSearch(filters.search, ['full_name', 'username', 'email'], ['phone']) : null;
  if (or) q = q.or(or);
  if (filters.role) q = q.eq('role', filters.role);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.sort === 'recent') q = q.order('created_at', { ascending: false });
  else if (filters.sort === 'activity') q = q.order('last_activity_at', { ascending: false, nullsFirst: false });
  else q = q.order('full_name');
  return unwrap(await q.limit(500)) as Employee[];
}

/** Lista corta para selectores (solo activos). */
export async function listActiveEmployees(): Promise<Pick<Employee, 'id' | 'full_name' | 'username' | 'role' | 'phone'>[]> {
  return (
    unwrap(await supabase.from('employees').select('id, full_name, username, role, phone').eq('status', 'active').order('full_name')) ?? []
  ) as Pick<Employee, 'id' | 'full_name' | 'username' | 'role' | 'phone'>[];
}

export async function getEmployee(id: string): Promise<Employee> {
  return unwrap(await supabase.from('employees').select('*').eq('id', id).single()) as Employee;
}

export async function getEmployeeNotes(id: string): Promise<string> {
  const row = unwrap(await supabase.from('employee_notes').select('notes').eq('employee_id', id).maybeSingle());
  return row?.notes ?? '';
}

export async function getWorkload(): Promise<WorkloadRow[]> {
  const rows = unwrap(await supabase.rpc('employee_workload')) as WorkloadRow[];
  return rows.map((r) => ({
    ...r,
    tasks_pending: Number(r.tasks_pending),
    tasks_in_progress: Number(r.tasks_in_progress),
    tasks_paused: Number(r.tasks_paused),
    tasks_completed: Number(r.tasks_completed),
    tasks_completed_7d: Number(r.tasks_completed_7d),
    tasks_overdue: Number(r.tasks_overdue),
    contacts_total: Number(r.contacts_total),
    contacts_uncontacted: Number(r.contacts_uncontacted),
  }));
}

export function createEmployee(employee: EmployeeInput) {
  return callFunction<{ employee: Employee; invite_url: string; expires_at: string }>('admin-employees', {
    action: 'create',
    employee,
    app_url: appBaseUrl(),
  });
}

export function updateEmployee(id: string, employee: Partial<EmployeeInput>) {
  return callFunction<{ employee: Employee }>('admin-employees', { action: 'update', id, employee });
}

export function setEmployeeStatus(id: string, status: EmployeeStatus, releaseContacts = false) {
  return callFunction<{ employee: Employee; released: number }>('admin-employees', {
    action: 'set_status',
    id,
    status,
    release_contacts: releaseContacts,
  });
}

export function createInviteLink(id: string) {
  return callFunction<{ invite_url: string; expires_at: string; purpose: 'activation' | 'reset' }>('admin-employees', {
    action: 'invite',
    id,
    app_url: appBaseUrl(),
  });
}

export async function updateMyProfile(phone: string, avatarUrl: string): Promise<void> {
  unwrap(await supabase.rpc('update_my_profile', { p_phone: phone, p_avatar_url: avatarUrl }));
}

export async function touchActivity(): Promise<void> {
  await supabase.rpc('touch_activity');
}
