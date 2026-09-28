import { supabase } from '../lib/supabase';
import type { ActivityLog, DashboardStats, Settings } from '../types/database';
import { unwrap } from '../utils/errors';

export async function getDashboardStats(): Promise<DashboardStats> {
  return unwrap(await supabase.rpc('admin_dashboard_stats')) as DashboardStats;
}

export type ActivityFilters = {
  action?: string;
  employeeId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export async function listActivity(filters: ActivityFilters = {}): Promise<{ rows: ActivityLog[]; count: number }> {
  const pageSize = filters.pageSize ?? 40;
  const page = filters.page ?? 0;
  let q = supabase.from('activity_logs').select('*', { count: 'exact' });
  if (filters.action) q = q.eq('action', filters.action);
  if (filters.employeeId) q = q.or(`actor_id.eq.${filters.employeeId},subject_id.eq.${filters.employeeId}`);
  if (filters.search) q = q.ilike('description', `%${filters.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  // Las fechas del filtro son locales: se convierten a instantes UTC exactos.
  if (filters.from) q = q.gte('created_at', new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) q = q.lte('created_at', new Date(`${filters.to}T23:59:59.999`).toISOString());
  const res = await q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  return { rows: unwrap(res) as ActivityLog[], count: res.count ?? 0 };
}

const SETTINGS_DEFAULTS: Settings = {
  default_country_code: '57',
  allow_employee_contacts: true,
  invitation_hours: 72,
  whatsapp_template: '',
  contact_categories: [],
};

export async function getSettings(): Promise<Settings> {
  const rows = unwrap(await supabase.from('settings').select('key, value')) as { key: keyof Settings; value: unknown }[];
  const out = { ...SETTINGS_DEFAULTS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as Settings;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const res = await supabase
    .from('settings')
    .update({ value, updated_at: new Date().toISOString(), updated_by: session.session?.user.id ?? null })
    .eq('key', key)
    .select('key');
  const rows = unwrap(res);
  if (!rows?.length) throw new Error('No tienes permiso para cambiar la configuración.');
}
