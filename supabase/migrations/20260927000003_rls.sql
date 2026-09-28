-- =====================================================================
-- WebZipe · Plataforma interna de empleados
-- 003 · Seguridad a nivel de fila (RLS), permisos y Realtime
--
-- Principio: por defecto nadie ve nada. Cada política abre solo lo
-- necesario. Los empleados escriben únicamente mediante RPCs validadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------
alter table public.roles                  enable row level security;
alter table public.employees              enable row level security;
alter table public.employee_notes         enable row level security;
alter table public.employee_groups        enable row level security;
alter table public.employee_group_members enable row level security;
alter table public.settings               enable row level security;
alter table public.contacts               enable row level security;
alter table public.assignments            enable row level security;
alter table public.tasks                  enable row level security;
alter table public.messages               enable row level security;
alter table public.message_recipients     enable row level security;
alter table public.announcements          enable row level security;
alter table public.announcement_reads     enable row level security;
alter table public.activity_logs          enable row level security;
alter table public.invitations            enable row level security; -- sin políticas: solo service role
alter table public.login_attempts         enable row level security; -- sin políticas: solo service role

-- ---------------------------------------------------------------------
-- Privilegios de tabla (segunda capa, además de RLS)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;
revoke all on all functions in schema private from anon, authenticated, public;

revoke all on public.invitations, public.login_attempts from authenticated;

-- Tablas que los clientes solo leen (las escrituras pasan por RPC o Edge Functions)
revoke insert, update, delete, truncate on
  public.roles, public.employees, public.assignments, public.activity_logs,
  public.messages, public.message_recipients, public.announcement_reads
from authenticated;

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------
create policy roles_select on public.roles
  for select to authenticated using (public.is_active_user());

-- ---------------------------------------------------------------------
-- employees: cada quien ve su fila; admin/supervisor ven todas.
-- Altas y cambios solo por la Edge Function admin-employees.
-- ---------------------------------------------------------------------
create policy employees_select on public.employees
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------
-- employee_notes: solo admin/supervisor
-- ---------------------------------------------------------------------
create policy employee_notes_staff on public.employee_notes
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------
-- Grupos: solo admin/supervisor
-- ---------------------------------------------------------------------
create policy employee_groups_staff on public.employee_groups
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy employee_group_members_staff on public.employee_group_members
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------
-- settings: lectura para usuarios activos, escritura solo admin
-- ---------------------------------------------------------------------
create policy settings_select on public.settings
  for select to authenticated using (public.is_active_user());

create policy settings_admin_update on public.settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke insert, delete on public.settings from authenticated;

-- ---------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------
create policy contacts_select on public.contacts
  for select to authenticated
  using (public.is_staff() or (assigned_to = auth.uid() and public.is_active_user()));

create policy contacts_staff_insert on public.contacts
  for insert to authenticated with check (public.is_staff());

create policy contacts_staff_update on public.contacts
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy contacts_admin_delete on public.contacts
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- assignments (historial de números)
-- ---------------------------------------------------------------------
create policy assignments_select on public.assignments
  for select to authenticated
  using (public.is_staff() or (employee_id = auth.uid() and public.is_active_user()));

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_staff() or (assigned_to = auth.uid() and public.is_active_user()));

create policy tasks_staff_insert on public.tasks
  for insert to authenticated with check (public.is_staff());

create policy tasks_staff_update on public.tasks
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy tasks_staff_delete on public.tasks
  for delete to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------
-- messages / message_recipients
-- ---------------------------------------------------------------------
create policy messages_select on public.messages
  for select to authenticated
  using (
    public.is_staff()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.message_recipients r
        where r.message_id = messages.id and r.employee_id = auth.uid()
      )
    )
  );

create policy message_recipients_select on public.message_recipients
  for select to authenticated
  using (public.is_staff() or (employee_id = auth.uid() and public.is_active_user()));

-- ---------------------------------------------------------------------
-- announcements / announcement_reads
-- ---------------------------------------------------------------------
create policy announcements_select on public.announcements
  for select to authenticated using (public.is_active_user());

create policy announcements_staff_insert on public.announcements
  for insert to authenticated with check (public.is_staff());

create policy announcements_staff_update on public.announcements
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy announcements_staff_delete on public.announcements
  for delete to authenticated using (public.is_staff());

create policy announcement_reads_select on public.announcement_reads
  for select to authenticated
  using (public.is_staff() or (employee_id = auth.uid() and public.is_active_user()));

-- ---------------------------------------------------------------------
-- activity_logs: staff ve todo; el empleado solo lo que hizo o lo que le afecta
-- ---------------------------------------------------------------------
create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (
    public.is_staff()
    or (public.is_active_user() and (actor_id = auth.uid() or subject_id = auth.uid()))
  );

-- ---------------------------------------------------------------------
-- Ejecución de funciones: solo usuarios autenticados (cada una valida el rol)
-- ---------------------------------------------------------------------
grant execute on function
  public.current_employee_role(),
  public.is_active_user(),
  public.is_staff(),
  public.is_admin(),
  public.assign_contact(uuid, uuid, boolean, text),
  public.bulk_assign_contacts(uuid[], uuid, boolean),
  public.release_contact(uuid, text),
  public.check_phone(text),
  public.claim_new_contact(jsonb),
  public.update_my_contact(uuid, public.contact_status, text),
  public.import_contacts(jsonb, uuid),
  public.update_task_status(uuid, public.task_status, text),
  public.send_message(text, text, public.message_audience, uuid, uuid),
  public.mark_message_read(uuid, boolean),
  public.set_announcement_read(uuid, boolean),
  public.mark_all_read(text),
  public.touch_activity(),
  public.update_my_profile(text, text),
  public.get_my_summary(),
  public.admin_dashboard_stats(),
  public.employee_workload()
to authenticated;

-- ---------------------------------------------------------------------
-- Realtime (notificaciones en vivo). Realtime respeta las políticas RLS.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.message_recipients, public.announcements, public.tasks, public.contacts;
  end if;
end;
$$;
