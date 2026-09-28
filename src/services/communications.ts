import { supabase } from '../lib/supabase';
import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementWithRead,
  EmployeeGroup,
  InboxMessage,
  MessageAudience,
  MySummary,
  SentMessage,
} from '../types/database';
import { unwrap } from '../utils/errors';

// ---------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------
export async function listInbox(userId: string, limit = 100): Promise<InboxMessage[]> {
  const rows = unwrap(
    await supabase
      .from('message_recipients')
      .select('read_at, message:messages (*)')
      .eq('employee_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as unknown as { read_at: string | null; message: InboxMessage | null }[];
  return rows
    .filter((r) => r.message)
    .map((r) => ({ ...(r.message as InboxMessage), read_at: r.read_at }));
}

export async function markMessageRead(messageId: string, read: boolean): Promise<void> {
  unwrap(await supabase.rpc('mark_message_read', { p_message_id: messageId, p_read: read }));
}

export async function markAllRead(kind: 'messages' | 'announcements'): Promise<void> {
  unwrap(await supabase.rpc('mark_all_read', { p_kind: kind }));
}

export async function sendMessage(input: {
  title: string;
  body: string;
  audience: MessageAudience;
  groupId?: string | null;
  employeeId?: string | null;
}) {
  return unwrap(
    await supabase.rpc('send_message', {
      p_title: input.title,
      p_body: input.body,
      p_audience: input.audience,
      p_group_id: input.groupId ?? null,
      p_employee_id: input.employeeId ?? null,
    }),
  ) as { message_id: string; recipients: number };
}

export async function listSentMessages(page = 0): Promise<{ rows: SentMessage[]; count: number }> {
  const pageSize = 30;
  const res = await supabase
    .from('messages')
    .select(
      `*, recipients:message_recipients (employee_id, read_at),
       group:employee_groups (name),
       target:employees!messages_employee_id_fkey (id, full_name)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  return { rows: unwrap(res) as unknown as SentMessage[], count: res.count ?? 0 };
}

// ---------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------
export async function listGroups(): Promise<EmployeeGroup[]> {
  return unwrap(
    await supabase.from('employee_groups').select('*, members:employee_group_members (employee_id)').order('name'),
  ) as EmployeeGroup[];
}

export async function saveGroup(group: { id?: string; name: string; description?: string | null }, memberIds: string[]) {
  const saved = group.id
    ? unwrap(await supabase.from('employee_groups').update({ name: group.name, description: group.description }).eq('id', group.id).select().single())
    : unwrap(await supabase.from('employee_groups').insert({ name: group.name, description: group.description }).select().single());
  const groupId = (saved as { id: string }).id;
  unwrap(await supabase.from('employee_group_members').delete().eq('group_id', groupId));
  if (memberIds.length) {
    unwrap(await supabase.from('employee_group_members').insert(memberIds.map((employee_id) => ({ group_id: groupId, employee_id }))));
  }
}

export async function deleteGroup(id: string): Promise<void> {
  unwrap(await supabase.from('employee_groups').delete().eq('id', id));
}

// ---------------------------------------------------------------------
// Actualizaciones (anuncios)
// ---------------------------------------------------------------------
export async function listAnnouncementsWithRead(userId: string, limit = 100): Promise<AnnouncementWithRead[]> {
  const [anns, reads] = await Promise.all([
    supabase.from('announcements').select('*').order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(limit),
    supabase.from('announcement_reads').select('announcement_id').eq('employee_id', userId),
  ]);
  const readSet = new Set((unwrap(reads) as { announcement_id: string }[]).map((r) => r.announcement_id));
  return (unwrap(anns) as Announcement[]).map((a) => ({ ...a, read: readSet.has(a.id) }));
}

export async function setAnnouncementRead(id: string, read: boolean): Promise<void> {
  unwrap(await supabase.rpc('set_announcement_read', { p_announcement_id: id, p_read: read }));
}

export type AnnouncementInput = { title: string; body: string; category: AnnouncementCategory; pinned: boolean };

export async function listAnnouncementsAdmin(): Promise<(Announcement & { reads: { count: number }[] })[]> {
  return unwrap(
    await supabase
      .from('announcements')
      .select('*, reads:announcement_reads (count)')
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(200),
  ) as (Announcement & { reads: { count: number }[] })[];
}

export async function createAnnouncement(input: AnnouncementInput): Promise<void> {
  unwrap(await supabase.from('announcements').insert(input));
}

export async function updateAnnouncement(id: string, input: AnnouncementInput): Promise<void> {
  unwrap(await supabase.from('announcements').update(input).eq('id', id));
}

export async function deleteAnnouncement(id: string): Promise<void> {
  unwrap(await supabase.from('announcements').delete().eq('id', id));
}

// ---------------------------------------------------------------------
// Resumen del empleado
// ---------------------------------------------------------------------
export async function getMySummary(): Promise<MySummary> {
  return unwrap(await supabase.rpc('get_my_summary')) as MySummary;
}
