-- =====================================================================
-- WebZipe · Plataforma interna de empleados
-- 001 · Esquema (tablas, tipos, índices)
--
-- Nota sobre "users": las cuentas y los hashes de contraseña viven en
-- auth.users (Supabase Auth, bcrypt). Nunca se guardan contraseñas en
-- tablas públicas. public.employees es el perfil 1:1 de cada cuenta.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.employee_status as enum ('active', 'inactive');

create type public.task_status as enum ('pendiente', 'en_proceso', 'completada', 'pausada');

create type public.task_priority as enum ('baja', 'media', 'alta', 'urgente');

create type public.contact_status as enum (
  'sin_contactar', 'contactado', 'respondio', 'interesado', 'no_interesado',
  'seguimiento', 'cliente', 'numero_incorrecto', 'no_contactar'
);

create type public.message_audience as enum ('all', 'group', 'employee');

create type public.announcement_category as enum (
  'instrucciones', 'proceso', 'clientes', 'campanas', 'herramientas', 'importante', 'web', 'general'
);

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
create table public.roles (
  code        text primary key check (code in ('admin', 'supervisor', 'employee')),
  name        text not null,
  description text not null default '',
  rank        int  not null
);

insert into public.roles (code, name, description, rank) values
  ('admin',      'Administrador', 'Administra absolutamente todo el sistema.',                 30),
  ('supervisor', 'Supervisor',    'Administra empleados (rol empleado), tareas y contactos.',  20),
  ('employee',   'Empleado',      'Solo accede a su propia información.',                     10);

-- ---------------------------------------------------------------------
-- Empleados (perfil de cada cuenta de auth.users)
-- ---------------------------------------------------------------------
create table public.employees (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text not null check (char_length(full_name) between 2 and 120),
  username         text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  email            text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone            text check (phone is null or char_length(phone) <= 30),
  role             text not null default 'employee' references public.roles (code),
  status           public.employee_status not null default 'active',
  hire_date        date,
  avatar_url       text check (avatar_url is null or avatar_url ~ '^https://'),
  password_set_at  timestamptz,
  last_login_at    timestamptz,
  last_activity_at timestamptz,
  created_by       uuid references public.employees (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index employees_role_status_idx on public.employees (role, status);

-- Notas internas del administrador sobre el empleado (el empleado no las ve).
create table public.employee_notes (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  notes       text not null default '' check (char_length(notes) <= 4000),
  updated_by  uuid references public.employees (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Grupos de empleados (para enviar comunicaciones a un grupo)
create table public.employee_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 60),
  description text,
  created_by  uuid references public.employees (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.employee_group_members (
  group_id    uuid not null references public.employee_groups (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (group_id, employee_id)
);

create index employee_group_members_employee_idx on public.employee_group_members (employee_id);

-- ---------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.employees (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('default_country_code',    '"57"'),
  ('allow_employee_contacts', 'true'),
  ('invitation_hours',        '72'),
  ('whatsapp_template',       '"Hola {nombre}, te escribo de WebZipe. Creamos páginas web profesionales para negocios como {empresa}. ¿Te puedo compartir una propuesta?"'),
  ('contact_categories',      '["Restaurante","Cafetería","Tienda","Barbería","Abogado","Salud","Belleza","Servicios","Otro"]');

-- ---------------------------------------------------------------------
-- Contactos (clientes / prospectos). Cada número existe una sola vez.
-- ---------------------------------------------------------------------
create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  name              text check (name is null or char_length(name) <= 120),
  business          text check (business is null or char_length(business) <= 160),
  category          text check (category is null or char_length(category) <= 60),
  phone             text not null unique check (phone ~ '^[0-9]{7,15}$'),
  whatsapp          text check (whatsapp is null or whatsapp ~ '^[0-9]{7,15}$'),
  city              text check (city is null or char_length(city) <= 80),
  status            public.contact_status not null default 'sin_contactar',
  notes             text check (notes is null or char_length(notes) <= 4000),
  website_url       text check (website_url is null or char_length(website_url) <= 300),
  proposed_url      text check (proposed_url is null or char_length(proposed_url) <= 300),
  assigned_to       uuid references public.employees (id) on delete set null,
  assigned_at       timestamptz,
  last_contacted_at timestamptz,
  created_by        uuid references public.employees (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index contacts_assigned_to_idx on public.contacts (assigned_to);
create index contacts_status_idx      on public.contacts (status);
create index contacts_created_at_idx  on public.contacts (created_at desc);

-- ---------------------------------------------------------------------
-- Asignaciones de números (historial). Una sola asignación activa
-- por contacto y por número: la base de datos lo garantiza.
-- ---------------------------------------------------------------------
create table public.assignments (
  id             bigint generated always as identity primary key,
  contact_id     uuid not null references public.contacts (id) on delete cascade,
  phone          text not null,
  employee_id    uuid not null references public.employees (id) on delete cascade,
  assigned_by    uuid references public.employees (id) on delete set null,
  assigned_at    timestamptz not null default now(),
  released_at    timestamptz,
  released_by    uuid references public.employees (id) on delete set null,
  release_reason text check (release_reason is null or char_length(release_reason) <= 300)
);

create unique index assignments_one_active_per_contact on public.assignments (contact_id) where released_at is null;
create unique index assignments_one_active_per_phone   on public.assignments (phone)      where released_at is null;
create index assignments_employee_idx on public.assignments (employee_id, assigned_at desc);

-- ---------------------------------------------------------------------
-- Tareas
-- ---------------------------------------------------------------------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 2 and 160),
  description   text check (description is null or char_length(description) <= 4000),
  contact_id    uuid references public.contacts (id) on delete set null,
  client_name   text check (client_name is null or char_length(client_name) <= 160),
  phone         text check (phone is null or phone ~ '^[0-9]{7,15}$'),
  assigned_to   uuid not null references public.employees (id) on delete cascade,
  created_by    uuid references public.employees (id) on delete set null,
  assigned_at   timestamptz not null default now(),
  due_date      date,
  priority      public.task_priority not null default 'media',
  status        public.task_status not null default 'pendiente',
  employee_note text check (employee_note is null or char_length(employee_note) <= 2000),
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index tasks_assigned_status_idx on public.tasks (assigned_to, status);
create index tasks_status_idx          on public.tasks (status, due_date);

-- ---------------------------------------------------------------------
-- Comunicaciones (mensajes) y destinatarios
-- ---------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid references public.employees (id) on delete set null,
  sender_name text not null default 'WebZipe',
  title       text not null check (char_length(title) between 2 and 160),
  body        text not null check (char_length(body) between 1 and 8000),
  audience    public.message_audience not null,
  group_id    uuid references public.employee_groups (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index messages_created_at_idx on public.messages (created_at desc);

create table public.message_recipients (
  message_id  uuid not null references public.messages (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  primary key (message_id, employee_id)
);

create index message_recipients_employee_idx on public.message_recipients (employee_id, created_at desc);
create index message_recipients_unread_idx   on public.message_recipients (employee_id) where read_at is null;

-- ---------------------------------------------------------------------
-- Actualizaciones (anuncios) y lecturas
-- ---------------------------------------------------------------------
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 2 and 160),
  body         text not null check (char_length(body) between 1 and 8000),
  category     public.announcement_category not null default 'general',
  pinned       boolean not null default false,
  author_id    uuid references public.employees (id) on delete set null,
  author_name  text not null default 'WebZipe',
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index announcements_published_idx on public.announcements (pinned desc, published_at desc);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  employee_id     uuid not null references public.employees (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, employee_id)
);

create index announcement_reads_employee_idx on public.announcement_reads (employee_id);

-- ---------------------------------------------------------------------
-- Registro de actividad
-- ---------------------------------------------------------------------
create table public.activity_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.employees (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   text,
  subject_id  uuid references public.employees (id) on delete set null, -- empleado afectado
  description text not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index activity_logs_created_idx on public.activity_logs (created_at desc);
create index activity_logs_actor_idx   on public.activity_logs (actor_id, created_at desc);
create index activity_logs_subject_idx on public.activity_logs (subject_id, created_at desc);
create index activity_logs_action_idx  on public.activity_logs (action, created_at desc);

-- ---------------------------------------------------------------------
-- Solo servidor (Edge Functions con service role). Sin acceso de clientes.
-- ---------------------------------------------------------------------
create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  token_hash  text not null unique,           -- SHA-256 del token; el token nunca se guarda
  purpose     text not null default 'activation' check (purpose in ('activation', 'reset')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid references public.employees (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index invitations_employee_idx on public.invitations (employee_id);

create table public.login_attempts (
  identifier   text primary key,
  failures     int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
