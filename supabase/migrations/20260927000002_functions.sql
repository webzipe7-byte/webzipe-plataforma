-- =====================================================================
-- WebZipe · Plataforma interna de empleados
-- 002 · Funciones auxiliares, triggers y RPCs (lógica de negocio segura)
--
-- Todas las RPCs son SECURITY DEFINER con search_path vacío y validan
-- el rol del usuario autenticado dentro de la función. Las funciones del
-- esquema "private" no son accesibles desde la API.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identidad del usuario actual (usadas por las políticas RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_employee_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select e.role from public.employees e
  where e.id = auth.uid() and e.status = 'active'
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_employee_role() is not null
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_employee_role() in ('admin', 'supervisor'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_employee_role() = 'admin', false)
$$;

-- ---------------------------------------------------------------------
-- Utilidades privadas
-- ---------------------------------------------------------------------
create or replace function private.require_active()
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role text := public.current_employee_role();
begin
  if v_role is null then
    raise exception 'No autorizado: inicia sesión con una cuenta activa.' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function private.require_staff()
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role text := private.require_active();
begin
  if v_role not in ('admin', 'supervisor') then
    raise exception 'No autorizado: se requiere rol de administrador o supervisor.' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function private.setting(p_key text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select value from public.settings where key = p_key
$$;

-- Deja solo dígitos y agrega el indicativo del país a números nacionales de 10 dígitos.
-- Devuelve null si el valor está vacío o no parece un número válido.
create or replace function private.normalize_phone(p_phone text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_digits text;
  v_cc     text := coalesce(private.setting('default_country_code') #>> '{}', '57');
begin
  if p_phone is null then
    return null;
  end if;
  v_digits := regexp_replace(p_phone, '\D', '', 'g');
  if v_digits = '' then
    return null;
  end if;
  if left(v_digits, 2) = '00' then
    v_digits := substr(v_digits, 3);
  end if;
  if char_length(v_digits) = 10 and left(v_digits, char_length(v_cc)) <> v_cc then
    v_digits := v_cc || v_digits;
  end if;
  if char_length(v_digits) < 7 or char_length(v_digits) > 15 then
    return null;
  end if;
  return v_digits;
end;
$$;

-- Número en formato legible: quita el indicativo por defecto.
create or replace function private.display_phone(p_phone text)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p_phone is null then ''
    when char_length(p_phone) > 10
         and left(p_phone, char_length(coalesce(private.setting('default_country_code') #>> '{}', '57')))
             = coalesce(private.setting('default_country_code') #>> '{}', '57')
      then substr(p_phone, char_length(coalesce(private.setting('default_country_code') #>> '{}', '57')) + 1)
    else '+' || p_phone
  end
$$;

create or replace function private.employee_name(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select full_name from public.employees where id = p_id), 'Sistema')
$$;

create or replace function private.contact_status_label(p_status public.contact_status)
returns text
language sql immutable
as $$
  select case p_status
    when 'sin_contactar'     then 'Sin contactar'
    when 'contactado'        then 'Contactado'
    when 'respondio'         then 'Respondió'
    when 'interesado'        then 'Interesado'
    when 'no_interesado'     then 'No interesado'
    when 'seguimiento'       then 'Seguimiento'
    when 'cliente'           then 'Cliente'
    when 'numero_incorrecto' then 'Número incorrecto'
    when 'no_contactar'      then 'No contactar'
  end
$$;

create or replace function private.task_status_label(p_status public.task_status)
returns text
language sql immutable
as $$
  select case p_status
    when 'pendiente'  then 'pendiente'
    when 'en_proceso' then 'en proceso'
    when 'completada' then 'completada'
    when 'pausada'    then 'pausada'
  end
$$;

create or replace function private.log(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
  p_subject uuid, p_description text, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, subject_id, description, metadata)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_subject, p_description, coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function private.is_bulk()
returns boolean
language sql stable
as $$
  select coalesce(current_setting('webzipe.bulk', true), '') = '1'
$$;

create or replace function private.clean_text(p text)
returns text
language sql immutable
as $$
  select nullif(btrim(p), '')
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger employees_updated_at     before update on public.employees     for each row execute function private.set_updated_at();
create trigger contacts_updated_at      before update on public.contacts      for each row execute function private.set_updated_at();
create trigger tasks_updated_at         before update on public.tasks         for each row execute function private.set_updated_at();
create trigger announcements_updated_at before update on public.announcements for each row execute function private.set_updated_at();

-- Contactos: normalización, validación del responsable y fechas.
create or replace function private.contacts_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_raw_phone text := new.phone;
begin
  new.phone := private.normalize_phone(new.phone);
  if new.phone is null then
    raise exception 'Número de teléfono inválido: %', coalesce(v_raw_phone, '(vacío)') using errcode = '22023';
  end if;
  if private.clean_text(new.whatsapp) is not null then
    new.whatsapp := private.normalize_phone(new.whatsapp);
    if new.whatsapp is null then
      raise exception 'Número de WhatsApp inválido.' using errcode = '22023';
    end if;
  else
    new.whatsapp := null;
  end if;

  new.name         := private.clean_text(new.name);
  new.business     := private.clean_text(new.business);
  new.category     := private.clean_text(new.category);
  new.city         := private.clean_text(new.city);
  new.notes        := private.clean_text(new.notes);
  new.website_url  := private.clean_text(new.website_url);
  new.proposed_url := private.clean_text(new.proposed_url);

  if tg_op = 'INSERT' then
    new.created_by  := coalesce(new.created_by, auth.uid());
    new.assigned_at := case when new.assigned_to is null then null else now() end;
  elsif new.assigned_to is distinct from old.assigned_to then
    new.assigned_at := case when new.assigned_to is null then null else now() end;
  end if;

  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (select 1 from public.employees e where e.id = new.assigned_to and e.status = 'active') then
    raise exception 'No se puede asignar: el empleado no existe o está inactivo.' using errcode = '22023';
  end if;

  if new.status <> 'sin_contactar' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    new.last_contacted_at := now();
  end if;

  return new;
end;
$$;

create trigger contacts_before_write
  before insert or update on public.contacts
  for each row execute function private.contacts_before_write();

-- Contactos: historial de asignaciones + registro de actividad.
create or replace function private.contacts_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor  uuid := auth.uid();
  v_reason text := private.clean_text(current_setting('webzipe.release_reason', true));
  v_bulk   boolean := private.is_bulk();
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null then
      insert into public.assignments (contact_id, phone, employee_id, assigned_by)
      values (new.id, new.phone, new.assigned_to, v_actor);
      if not v_bulk then
        perform private.log(
          v_actor, 'contact_assigned', 'contact', new.id::text, new.assigned_to,
          case when v_actor = new.assigned_to
            then format('%s registró y tomó el contacto %s.', private.employee_name(v_actor), private.display_phone(new.phone))
            else format('%s asignó el contacto %s a %s.', private.employee_name(v_actor), private.display_phone(new.phone), private.employee_name(new.assigned_to))
          end,
          jsonb_build_object('phone', new.phone)
        );
      end if;
    end if;
    return null;
  end if;

  if new.phone <> old.phone then
    update public.assignments set phone = new.phone
    where contact_id = new.id and released_at is null;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    update public.assignments
       set released_at    = now(),
           released_by    = v_actor,
           release_reason = coalesce(v_reason, case when new.assigned_to is null then 'Liberado' else 'Reasignado' end)
     where contact_id = new.id and released_at is null;

    if new.assigned_to is not null then
      insert into public.assignments (contact_id, phone, employee_id, assigned_by)
      values (new.id, new.phone, new.assigned_to, v_actor);
    end if;

    if not v_bulk then
      if new.assigned_to is null then
        perform private.log(
          v_actor, 'contact_released', 'contact', new.id::text, old.assigned_to,
          format('%s liberó el número %s (estaba asignado a %s).', private.employee_name(v_actor), private.display_phone(new.phone), private.employee_name(old.assigned_to)),
          jsonb_build_object('phone', new.phone, 'reason', v_reason)
        );
      elsif old.assigned_to is null then
        perform private.log(
          v_actor, 'contact_assigned', 'contact', new.id::text, new.assigned_to,
          format('%s asignó el contacto %s a %s.', private.employee_name(v_actor), private.display_phone(new.phone), private.employee_name(new.assigned_to)),
          jsonb_build_object('phone', new.phone)
        );
      else
        perform private.log(
          v_actor, 'contact_reassigned', 'contact', new.id::text, new.assigned_to,
          format('%s reasignó el contacto %s de %s a %s.', private.employee_name(v_actor), private.display_phone(new.phone), private.employee_name(old.assigned_to), private.employee_name(new.assigned_to)),
          jsonb_build_object('phone', new.phone, 'from', old.assigned_to, 'reason', v_reason)
        );
      end if;
    end if;
  end if;

  if new.status is distinct from old.status and not v_bulk then
    perform private.log(
      v_actor, 'contact_updated', 'contact', new.id::text, new.assigned_to,
      format('%s actualizó el contacto %s: %s.', private.employee_name(v_actor), private.display_phone(new.phone), private.contact_status_label(new.status)),
      jsonb_build_object('phone', new.phone, 'from', old.status, 'to', new.status)
    );
  end if;

  return null;
end;
$$;

create trigger contacts_after_write
  after insert or update on public.contacts
  for each row execute function private.contacts_after_write();

-- Tareas: datos del cliente, fechas de inicio/fin y validaciones.
create or replace function private.tasks_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_contact public.contacts;
  v_raw     text := new.phone;
begin
  new.title         := btrim(new.title);
  new.description   := private.clean_text(new.description);
  new.client_name   := private.clean_text(new.client_name);
  new.employee_note := private.clean_text(new.employee_note);

  if tg_op = 'INSERT' then
    new.created_by  := coalesce(new.created_by, auth.uid());
    new.assigned_at := now();
  end if;

  if new.contact_id is not null
     and (tg_op = 'INSERT' or new.contact_id is distinct from old.contact_id
          or new.client_name is null or new.phone is null) then
    select * into v_contact from public.contacts where id = new.contact_id;
    if found then
      new.client_name := coalesce(new.client_name, private.clean_text(concat_ws(' · ', v_contact.name, v_contact.business)));
      new.phone       := coalesce(private.clean_text(new.phone), v_contact.phone);
    end if;
  end if;

  if private.clean_text(new.phone) is not null then
    new.phone := private.normalize_phone(new.phone);
    if new.phone is null then
      raise exception 'Número de teléfono inválido: %', v_raw using errcode = '22023';
    end if;
  else
    new.phone := null;
  end if;

  if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    if not exists (select 1 from public.employees e where e.id = new.assigned_to and e.status = 'active') then
      raise exception 'No se puede asignar: el empleado no existe o está inactivo.' using errcode = '22023';
    end if;
    if tg_op = 'UPDATE' then
      new.assigned_at := now();
    end if;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'en_proceso' and new.started_at is null then
      new.started_at := now();
    end if;
    if new.status = 'completada' then
      new.completed_at := now();
      new.started_at   := coalesce(new.started_at, now());
    else
      new.completed_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function private.tasks_before_write();

create or replace function private.tasks_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    perform private.log(
      v_actor, 'task_assigned', 'task', new.id::text, new.assigned_to,
      format('%s asignó la tarea «%s» a %s.', private.employee_name(v_actor), new.title, private.employee_name(new.assigned_to)),
      jsonb_build_object('priority', new.priority, 'due_date', new.due_date)
    );
    return null;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    perform private.log(
      v_actor, 'task_reassigned', 'task', new.id::text, new.assigned_to,
      format('%s reasignó la tarea «%s» de %s a %s.', private.employee_name(v_actor), new.title, private.employee_name(old.assigned_to), private.employee_name(new.assigned_to)),
      jsonb_build_object('from', old.assigned_to)
    );
  end if;

  if new.status is distinct from old.status then
    perform private.log(
      v_actor,
      case when new.status = 'completada' then 'task_completed' else 'task_status' end,
      'task', new.id::text, new.assigned_to,
      format('%s marcó la tarea «%s» como %s.', private.employee_name(v_actor), new.title, private.task_status_label(new.status)),
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return null;
end;
$$;

create trigger tasks_after_write
  after insert or update on public.tasks
  for each row execute function private.tasks_after_write();

-- Actualizaciones: autor y registro.
create or replace function private.announcements_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.author_id    := coalesce(new.author_id, auth.uid());
  new.author_name  := private.employee_name(new.author_id);
  new.published_at := now();
  return new;
end;
$$;

create trigger announcements_before_insert
  before insert on public.announcements
  for each row execute function private.announcements_before_insert();

create or replace function private.announcements_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.log(
    new.author_id, 'announcement_published', 'announcement', new.id::text, null,
    format('%s publicó una nueva actualización: «%s».', new.author_name, new.title),
    jsonb_build_object('category', new.category)
  );
  return null;
end;
$$;

create trigger announcements_after_insert
  after insert on public.announcements
  for each row execute function private.announcements_after_insert();

-- ---------------------------------------------------------------------
-- RPC · Números y contactos
-- ---------------------------------------------------------------------

-- Asigna (o reasigna) un contacto. Si el número ya pertenece a otro
-- empleado devuelve {ok:false, code:'already_assigned'} para que la
-- interfaz pida confirmación; con p_force = true reasigna.
create or replace function public.assign_contact(
  p_contact_id uuid, p_employee_id uuid, p_force boolean default false, p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_contact public.contacts;
begin
  perform private.require_staff();

  select * into v_contact from public.contacts where id = p_contact_id for update;
  if not found then
    raise exception 'Contacto no encontrado.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and status = 'active') then
    raise exception 'El empleado no existe o está inactivo.' using errcode = '22023';
  end if;
  if v_contact.assigned_to = p_employee_id then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  if not p_force and (v_contact.assigned_to is not null or v_contact.status = 'no_contactar') then
    return jsonb_build_object(
      'ok', false,
      'code', case when v_contact.assigned_to is not null then 'already_assigned' else 'do_not_contact' end,
      'assigned_to', v_contact.assigned_to,
      'assigned_to_name', case when v_contact.assigned_to is null then null else private.employee_name(v_contact.assigned_to) end,
      'assigned_at', v_contact.assigned_at,
      'do_not_contact', v_contact.status = 'no_contactar'
    );
  end if;

  perform set_config('webzipe.release_reason', coalesce(p_reason, ''), true);
  update public.contacts set assigned_to = p_employee_id where id = p_contact_id;
  perform set_config('webzipe.release_reason', '', true);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.bulk_assign_contacts(
  p_contact_ids uuid[], p_employee_id uuid, p_force boolean default false
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_assigned int := 0;
  v_skipped_taken int := 0;
  v_skipped_dnc int := 0;
  v_contact public.contacts;
begin
  perform private.require_staff();
  if coalesce(array_length(p_contact_ids, 1), 0) = 0 then
    return jsonb_build_object('assigned', 0, 'skipped_taken', 0, 'skipped_dnc', 0);
  end if;
  if array_length(p_contact_ids, 1) > 1000 then
    raise exception 'Máximo 1000 contactos por operación.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and status = 'active') then
    raise exception 'El empleado no existe o está inactivo.' using errcode = '22023';
  end if;

  perform set_config('webzipe.bulk', '1', true);
  for v_contact in select * from public.contacts where id = any (p_contact_ids) for update loop
    if v_contact.assigned_to = p_employee_id then
      continue;
    elsif v_contact.assigned_to is not null and not p_force then
      v_skipped_taken := v_skipped_taken + 1;
    elsif v_contact.status = 'no_contactar' and not p_force then
      v_skipped_dnc := v_skipped_dnc + 1;
    else
      update public.contacts set assigned_to = p_employee_id where id = v_contact.id;
      v_assigned := v_assigned + 1;
    end if;
  end loop;
  perform set_config('webzipe.bulk', '', true);

  if v_assigned > 0 then
    perform private.log(
      auth.uid(), 'contact_assigned', 'contact', null, p_employee_id,
      format('%s asignó %s contactos a %s.', private.employee_name(auth.uid()), v_assigned, private.employee_name(p_employee_id)),
      jsonb_build_object('count', v_assigned)
    );
  end if;

  return jsonb_build_object('assigned', v_assigned, 'skipped_taken', v_skipped_taken, 'skipped_dnc', v_skipped_dnc);
end;
$$;

create or replace function public.release_contact(p_contact_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_staff();
  perform set_config('webzipe.release_reason', coalesce(left(p_reason, 300), ''), true);
  update public.contacts set assigned_to = null where id = p_contact_id and assigned_to is not null;
  perform set_config('webzipe.release_reason', '', true);
end;
$$;

-- Verifica si un número ya existe / está asignado. Los empleados no ven
-- a quién pertenece un número ajeno; el intento queda registrado.
create or replace function public.check_phone(p_phone text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role    text := private.require_active();
  v_uid     uuid := auth.uid();
  v_phone   text := private.normalize_phone(p_phone);
  v_contact public.contacts;
  v_staff   boolean := v_role in ('admin', 'supervisor');
begin
  if v_phone is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_contact from public.contacts
  where phone = v_phone or whatsapp = v_phone
  order by (phone = v_phone) desc
  limit 1;

  if not found then
    return jsonb_build_object('status', 'free', 'phone', v_phone);
  end if;

  if v_contact.assigned_to = v_uid then
    return jsonb_build_object('status', 'mine', 'phone', v_phone, 'contact_id', v_contact.id, 'contact_status', v_contact.status);
  end if;

  if v_contact.assigned_to is null then
    return jsonb_build_object(
      'status', 'unassigned', 'phone', v_phone,
      'contact_id', case when v_staff then v_contact.id end,
      'do_not_contact', v_contact.status = 'no_contactar'
    );
  end if;

  if not v_staff then
    perform private.log(
      v_uid, 'number_conflict', 'contact', v_contact.id::text, v_uid,
      format('%s intentó usar el número %s, que ya está asignado a %s.', private.employee_name(v_uid), private.display_phone(v_phone), private.employee_name(v_contact.assigned_to)),
      jsonb_build_object('phone', v_phone, 'assigned_to', v_contact.assigned_to)
    );
  end if;

  return jsonb_build_object(
    'status', 'taken', 'phone', v_phone,
    'contact_id', case when v_staff then v_contact.id end,
    'assigned_to_name', case when v_staff then private.employee_name(v_contact.assigned_to) end,
    'assigned_at', case when v_staff then v_contact.assigned_at end,
    'do_not_contact', v_contact.status = 'no_contactar'
  );
end;
$$;

-- El empleado registra un número nuevo que consiguió y queda asignado a él.
create or replace function public.claim_new_contact(p_contact jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role  text := private.require_active();
  v_uid   uuid := auth.uid();
  v_check jsonb;
  v_id    uuid;
begin
  if v_role = 'employee' and coalesce((private.setting('allow_employee_contacts'))::boolean, false) = false then
    raise exception 'El registro de contactos por empleados está desactivado.' using errcode = '42501';
  end if;

  v_check := public.check_phone(p_contact ->> 'phone');
  if v_check ->> 'status' = 'invalid' then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  elsif v_check ->> 'status' <> 'free' then
    return jsonb_build_object('ok', false, 'code', v_check ->> 'status', 'assigned_to_name', v_check ->> 'assigned_to_name');
  end if;

  begin
    insert into public.contacts (name, business, category, phone, whatsapp, city, notes, website_url, assigned_to, created_by)
    values (
      left(p_contact ->> 'name', 120), left(p_contact ->> 'business', 160), left(p_contact ->> 'category', 60),
      p_contact ->> 'phone', p_contact ->> 'whatsapp', left(p_contact ->> 'city', 80),
      left(p_contact ->> 'notes', 4000), left(p_contact ->> 'website_url', 300), v_uid, v_uid
    )
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'taken');
  end;

  return jsonb_build_object('ok', true, 'contact_id', v_id);
end;
$$;

-- El empleado actualiza el estado / observaciones de SU contacto.
create or replace function public.update_my_contact(
  p_contact_id uuid, p_status public.contact_status default null, p_notes text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := private.require_active();
begin
  update public.contacts
     set status = coalesce(p_status, status),
         notes  = case when p_notes is null then notes else left(p_notes, 4000) end
   where id = p_contact_id
     and (assigned_to = auth.uid() or v_role in ('admin', 'supervisor'));
  if not found then
    raise exception 'Contacto no encontrado o no asignado a ti.' using errcode = '42501';
  end if;
  perform public.touch_activity();
end;
$$;

-- Importación masiva de números (lista pegada o CSV ya interpretado en el cliente).
create or replace function public.import_contacts(p_rows jsonb, p_assign_to uuid default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row       jsonb;
  v_phone     text;
  v_inserted  int := 0;
  v_duplicates jsonb := '[]'::jsonb;
  v_invalid    jsonb := '[]'::jsonb;
begin
  perform private.require_staff();
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato inválido.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Máximo 2000 filas por importación.' using errcode = '22023';
  end if;
  if p_assign_to is not null and not exists (select 1 from public.employees where id = p_assign_to and status = 'active') then
    raise exception 'El empleado no existe o está inactivo.' using errcode = '22023';
  end if;

  perform set_config('webzipe.bulk', '1', true);
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_phone := private.normalize_phone(v_row ->> 'phone');
    if v_phone is null then
      v_invalid := v_invalid || to_jsonb(coalesce(v_row ->> 'phone', ''));
      continue;
    end if;
    if exists (select 1 from public.contacts where phone = v_phone) then
      v_duplicates := v_duplicates || to_jsonb(v_phone);
      continue;
    end if;
    begin
      insert into public.contacts (name, business, category, phone, whatsapp, city, notes, website_url, assigned_to)
      values (
        left(v_row ->> 'name', 120), left(v_row ->> 'business', 160), left(v_row ->> 'category', 60), v_phone,
        coalesce(v_row ->> 'whatsapp', v_phone), left(v_row ->> 'city', 80), left(v_row ->> 'notes', 4000),
        left(v_row ->> 'website_url', 300), p_assign_to
      );
      v_inserted := v_inserted + 1;
    exception
      when unique_violation then
        v_duplicates := v_duplicates || to_jsonb(v_phone);
      when others then
        v_invalid := v_invalid || to_jsonb(coalesce(v_row ->> 'phone', ''));
    end;
  end loop;
  perform set_config('webzipe.bulk', '', true);

  if v_inserted > 0 then
    perform private.log(
      auth.uid(), 'contacts_imported', 'contact', null, p_assign_to,
      case when p_assign_to is null
        then format('%s importó %s contactos nuevos.', private.employee_name(auth.uid()), v_inserted)
        else format('%s importó %s contactos y los asignó a %s.', private.employee_name(auth.uid()), v_inserted, private.employee_name(p_assign_to))
      end,
      jsonb_build_object('count', v_inserted)
    );
  end if;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_duplicates, 'invalid', v_invalid);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC · Tareas
-- ---------------------------------------------------------------------
create or replace function public.update_task_status(
  p_task_id uuid, p_status public.task_status, p_note text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := private.require_active();
begin
  update public.tasks
     set status        = p_status,
         employee_note = case when p_note is null then employee_note else left(p_note, 2000) end
   where id = p_task_id
     and (assigned_to = auth.uid() or v_role in ('admin', 'supervisor'));
  if not found then
    raise exception 'Tarea no encontrada o no asignada a ti.' using errcode = '42501';
  end if;
  perform public.touch_activity();
end;
$$;

-- ---------------------------------------------------------------------
-- RPC · Comunicaciones
-- ---------------------------------------------------------------------
create or replace function public.send_message(
  p_title text, p_body text, p_audience public.message_audience,
  p_group_id uuid default null, p_employee_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_id      uuid;
  v_count   int;
  v_target  text;
begin
  perform private.require_staff();
  if char_length(btrim(coalesce(p_title, ''))) < 2 or char_length(btrim(coalesce(p_body, ''))) < 1 then
    raise exception 'El título y el mensaje son obligatorios.' using errcode = '22023';
  end if;
  if p_audience = 'group' and p_group_id is null then
    raise exception 'Selecciona un grupo.' using errcode = '22023';
  end if;
  if p_audience = 'employee' and p_employee_id is null then
    raise exception 'Selecciona un empleado.' using errcode = '22023';
  end if;

  insert into public.messages (sender_id, sender_name, title, body, audience, group_id, employee_id)
  values (
    v_uid, private.employee_name(v_uid), btrim(p_title), btrim(p_body), p_audience,
    case when p_audience = 'group' then p_group_id end,
    case when p_audience = 'employee' then p_employee_id end
  )
  returning id into v_id;

  insert into public.message_recipients (message_id, employee_id)
  select v_id, e.id
  from public.employees e
  where e.status = 'active'
    and e.id <> v_uid
    and (
      p_audience = 'all'
      or (p_audience = 'group' and e.id in (select m.employee_id from public.employee_group_members m where m.group_id = p_group_id))
      or (p_audience = 'employee' and e.id = p_employee_id)
    );
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'No hay destinatarios activos para este mensaje.' using errcode = '22023';
  end if;

  v_target := case p_audience
    when 'all' then 'todos los empleados'
    when 'group' then 'el grupo ' || coalesce((select name from public.employee_groups where id = p_group_id), '')
    else private.employee_name(p_employee_id)
  end;

  perform private.log(
    v_uid, 'message_sent', 'message', v_id::text,
    case when p_audience = 'employee' then p_employee_id end,
    format('%s envió el mensaje «%s» a %s.', private.employee_name(v_uid), btrim(p_title), v_target),
    jsonb_build_object('audience', p_audience, 'recipients', v_count)
  );

  return jsonb_build_object('message_id', v_id, 'recipients', v_count);
end;
$$;

create or replace function public.mark_message_read(p_message_id uuid, p_read boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active();
  update public.message_recipients
     set read_at = case when p_read then coalesce(read_at, now()) else null end
   where message_id = p_message_id and employee_id = auth.uid();
end;
$$;

create or replace function public.set_announcement_read(p_announcement_id uuid, p_read boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active();
  if p_read then
    insert into public.announcement_reads (announcement_id, employee_id)
    values (p_announcement_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.announcement_reads
    where announcement_id = p_announcement_id and employee_id = auth.uid();
  end if;
end;
$$;

create or replace function public.mark_all_read(p_kind text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active();
  if p_kind = 'messages' then
    update public.message_recipients set read_at = now()
    where employee_id = auth.uid() and read_at is null;
  elsif p_kind = 'announcements' then
    insert into public.announcement_reads (announcement_id, employee_id)
    select a.id, auth.uid() from public.announcements a
    on conflict do nothing;
  else
    raise exception 'Tipo inválido.' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC · Perfil y actividad
-- ---------------------------------------------------------------------
create or replace function public.touch_activity()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.employees
     set last_activity_at = now()
   where id = auth.uid()
     and status = 'active'
     and (last_activity_at is null or last_activity_at < now() - interval '2 minutes');
end;
$$;

create or replace function public.update_my_profile(p_phone text default null, p_avatar_url text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active();
  if p_avatar_url is not null and p_avatar_url <> '' and p_avatar_url !~ '^https://' then
    raise exception 'La foto debe ser un enlace https://' using errcode = '22023';
  end if;
  update public.employees
     set phone      = case when p_phone is null then phone else left(private.clean_text(p_phone), 30) end,
         avatar_url = case when p_avatar_url is null then avatar_url else private.clean_text(p_avatar_url) end
   where id = auth.uid();
end;
$$;

create or replace function public.get_my_summary()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform private.require_active();
  return jsonb_build_object(
    'unread_messages',       (select count(*) from public.message_recipients where employee_id = v_uid and read_at is null),
    'unread_announcements',  (select count(*) from public.announcements a
                               where not exists (select 1 from public.announcement_reads r where r.announcement_id = a.id and r.employee_id = v_uid)),
    'tasks_pending',         (select count(*) from public.tasks where assigned_to = v_uid and status = 'pendiente'),
    'tasks_in_progress',     (select count(*) from public.tasks where assigned_to = v_uid and status = 'en_proceso'),
    'tasks_paused',          (select count(*) from public.tasks where assigned_to = v_uid and status = 'pausada'),
    'tasks_completed',       (select count(*) from public.tasks where assigned_to = v_uid and status = 'completada'),
    'tasks_overdue',         (select count(*) from public.tasks where assigned_to = v_uid and status <> 'completada' and due_date < current_date),
    'contacts_total',        (select count(*) from public.contacts where assigned_to = v_uid),
    'contacts_uncontacted',  (select count(*) from public.contacts where assigned_to = v_uid and status = 'sin_contactar'),
    'contacts_followup',     (select count(*) from public.contacts where assigned_to = v_uid and status in ('seguimiento', 'interesado', 'respondio'))
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RPC · Panel administrativo
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_staff();
  return jsonb_build_object(
    'employees_active',   (select count(*) from public.employees where status = 'active'),
    'employees_inactive', (select count(*) from public.employees where status = 'inactive'),
    'employees_pending_activation', (select count(*) from public.employees where status = 'active' and password_set_at is null),
    'tasks_pendiente',    (select count(*) from public.tasks where status = 'pendiente'),
    'tasks_en_proceso',   (select count(*) from public.tasks where status = 'en_proceso'),
    'tasks_pausada',      (select count(*) from public.tasks where status = 'pausada'),
    'tasks_completada',   (select count(*) from public.tasks where status = 'completada'),
    'tasks_overdue',      (select count(*) from public.tasks where status <> 'completada' and due_date < current_date),
    'tasks_completed_today', (select count(*) from public.tasks where completed_at >= date_trunc('day', now())),
    'contacts_total',        (select count(*) from public.contacts),
    'contacts_unassigned',   (select count(*) from public.contacts where assigned_to is null),
    'contacts_sin_contactar',(select count(*) from public.contacts where status = 'sin_contactar'),
    'contacts_contactados',  (select count(*) from public.contacts where status not in ('sin_contactar')),
    'contacts_interesados',  (select count(*) from public.contacts where status = 'interesado'),
    'contacts_clientes',     (select count(*) from public.contacts where status = 'cliente')
  );
end;
$$;

create or replace function public.employee_workload()
returns table (
  employee_id uuid, full_name text, username text, role text, status public.employee_status,
  avatar_url text, last_activity_at timestamptz, last_login_at timestamptz, password_set boolean,
  tasks_pending bigint, tasks_in_progress bigint, tasks_paused bigint, tasks_completed bigint,
  tasks_completed_7d bigint, tasks_overdue bigint, contacts_total bigint, contacts_uncontacted bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_staff();
  return query
  select
    e.id, e.full_name, e.username, e.role, e.status, e.avatar_url, e.last_activity_at, e.last_login_at,
    e.password_set_at is not null,
    count(t.id) filter (where t.status = 'pendiente'),
    count(t.id) filter (where t.status = 'en_proceso'),
    count(t.id) filter (where t.status = 'pausada'),
    count(t.id) filter (where t.status = 'completada'),
    count(t.id) filter (where t.status = 'completada' and t.completed_at >= now() - interval '7 days'),
    count(t.id) filter (where t.status <> 'completada' and t.due_date < current_date),
    (select count(*) from public.contacts c where c.assigned_to = e.id),
    (select count(*) from public.contacts c where c.assigned_to = e.id and c.status = 'sin_contactar')
  from public.employees e
  left join public.tasks t on t.assigned_to = e.id
  group by e.id
  order by e.status, e.full_name;
end;
$$;
