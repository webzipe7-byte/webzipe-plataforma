import { supabase } from '../lib/supabase';
import type { Assignment, Contact, ContactStatus, PhoneCheck } from '../types/database';
import { unwrap } from '../utils/errors';
import { orSearch } from '../utils/search';

const CONTACT_SELECT = '*, assignee:employees!contacts_assigned_to_fkey (id, full_name)';

export type ContactFilters = {
  search?: string;
  status?: ContactStatus | '';
  employeeId?: string | 'none' | '';
  category?: string;
  sort?: 'recent' | 'name' | 'assigned' | 'updated';
  page?: number;
  pageSize?: number;
};

export type ContactInput = {
  name?: string | null;
  business?: string | null;
  category?: string | null;
  phone: string;
  whatsapp?: string | null;
  city?: string | null;
  status?: ContactStatus;
  notes?: string | null;
  website_url?: string | null;
  proposed_url?: string | null;
};

export async function listContacts(filters: ContactFilters = {}): Promise<{ rows: Contact[]; count: number }> {
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;
  let q = supabase.from('contacts').select(CONTACT_SELECT, { count: 'exact' });

  const or = filters.search ? orSearch(filters.search, ['name', 'business', 'city', 'category'], ['phone', 'whatsapp']) : null;
  if (or) q = q.or(or);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.employeeId === 'none') q = q.is('assigned_to', null);
  else if (filters.employeeId) q = q.eq('assigned_to', filters.employeeId);
  if (filters.category) q = q.eq('category', filters.category);

  switch (filters.sort) {
    case 'name':
      q = q.order('business', { ascending: true, nullsFirst: false }).order('name');
      break;
    case 'assigned':
      q = q.order('assigned_at', { ascending: false, nullsFirst: false });
      break;
    case 'updated':
      q = q.order('updated_at', { ascending: false });
      break;
    default:
      q = q.order('created_at', { ascending: false });
  }

  const res = await q.range(page * pageSize, page * pageSize + pageSize - 1);
  const rows = unwrap(res) as Contact[];
  return { rows, count: res.count ?? rows.length };
}

/** Contactos del usuario actual (RLS solo devuelve los asignados a él). */
export async function listMyContacts(): Promise<Contact[]> {
  return unwrap(await supabase.from('contacts').select('*').order('assigned_at', { ascending: false }).limit(1000)) as Contact[];
}

export async function searchContactsForSelect(query: string): Promise<Contact[]> {
  let q = supabase.from('contacts').select(CONTACT_SELECT);
  const or = orSearch(query, ['name', 'business'], ['phone']);
  if (or) q = q.or(or);
  return unwrap(await q.order('updated_at', { ascending: false }).limit(12)) as Contact[];
}

export async function getContact(id: string): Promise<Contact> {
  return unwrap(await supabase.from('contacts').select(CONTACT_SELECT).eq('id', id).single()) as Contact;
}

export async function createContact(input: ContactInput): Promise<Contact> {
  return unwrap(await supabase.from('contacts').insert(input).select(CONTACT_SELECT).single()) as Contact;
}

export async function updateContact(id: string, input: Partial<ContactInput>): Promise<Contact> {
  return unwrap(await supabase.from('contacts').update(input).eq('id', id).select(CONTACT_SELECT).single()) as Contact;
}

export async function deleteContact(id: string): Promise<void> {
  unwrap(await supabase.from('contacts').delete().eq('id', id));
}

export type AssignResult =
  | { ok: true; unchanged?: boolean }
  | {
      ok: false;
      code: 'already_assigned' | 'do_not_contact';
      assigned_to: string | null;
      assigned_to_name: string | null;
      assigned_at: string | null;
      do_not_contact: boolean;
    };

export async function assignContact(contactId: string, employeeId: string, force = false, reason?: string): Promise<AssignResult> {
  return unwrap(
    await supabase.rpc('assign_contact', {
      p_contact_id: contactId,
      p_employee_id: employeeId,
      p_force: force,
      p_reason: reason ?? null,
    }),
  ) as AssignResult;
}

export async function bulkAssign(contactIds: string[], employeeId: string, force = false) {
  return unwrap(
    await supabase.rpc('bulk_assign_contacts', { p_contact_ids: contactIds, p_employee_id: employeeId, p_force: force }),
  ) as { assigned: number; skipped_taken: number; skipped_dnc: number };
}

export async function releaseContact(contactId: string, reason?: string): Promise<void> {
  unwrap(await supabase.rpc('release_contact', { p_contact_id: contactId, p_reason: reason ?? null }));
}

export async function checkPhone(phone: string): Promise<PhoneCheck> {
  return unwrap(await supabase.rpc('check_phone', { p_phone: phone })) as PhoneCheck;
}

export async function claimNewContact(input: ContactInput) {
  return unwrap(await supabase.rpc('claim_new_contact', { p_contact: input })) as
    | { ok: true; contact_id: string }
    | { ok: false; code: 'invalid' | 'taken' | 'mine' | 'unassigned'; assigned_to_name?: string | null };
}

export async function updateMyContact(id: string, status: ContactStatus | null, notes: string | null): Promise<void> {
  unwrap(await supabase.rpc('update_my_contact', { p_contact_id: id, p_status: status, p_notes: notes }));
}

export type ImportRow = { phone: string; name?: string; business?: string; category?: string; city?: string; notes?: string };

export async function importContacts(rows: ImportRow[], assignTo: string | null) {
  return unwrap(await supabase.rpc('import_contacts', { p_rows: rows, p_assign_to: assignTo })) as {
    inserted: number;
    duplicates: string[];
    invalid: string[];
  };
}

/** Interpreta texto pegado: una fila por línea, columnas separadas por coma, punto y coma o tabulación.
 *  Orden: teléfono, negocio, nombre, categoría, ciudad, observaciones. */
export function parseImportText(text: string): ImportRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(tel|phone|n[uú]mero)/i.test(line)) // encabezado opcional
    .map((line) => {
      const cols = line.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim());
      const [phone, business, name, category, city, notes] = cols;
      return { phone, business, name, category, city, notes };
    });
}

// ---------------------------------------------------------------------
// Historial de números
// ---------------------------------------------------------------------
const ASSIGNMENT_SELECT = `*,
  employee:employees!assignments_employee_id_fkey (id, full_name),
  assigner:employees!assignments_assigned_by_fkey (id, full_name),
  contact:contacts (id, name, business, status)`;

export async function listAssignments(filters: { active?: boolean; employeeId?: string; phone?: string; page?: number }) {
  const pageSize = 50;
  const page = filters.page ?? 0;
  let q = supabase.from('assignments').select(ASSIGNMENT_SELECT, { count: 'exact' });
  if (filters.active === true) q = q.is('released_at', null);
  if (filters.active === false) q = q.not('released_at', 'is', null);
  if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
  const digits = (filters.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 3) q = q.ilike('phone', `%${digits}%`);
  const res = await q.order('assigned_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  return { rows: unwrap(res) as Assignment[], count: res.count ?? 0 };
}

export async function contactHistory(contactId: string): Promise<Assignment[]> {
  return unwrap(
    await supabase.from('assignments').select(ASSIGNMENT_SELECT).eq('contact_id', contactId).order('assigned_at', { ascending: false }),
  ) as Assignment[];
}
