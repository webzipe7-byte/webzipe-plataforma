// Tipos que reflejan las tablas de supabase/migrations.

export type Role = 'admin' | 'supervisor' | 'employee';
export type EmployeeStatus = 'active' | 'inactive';
export type TaskStatus = 'pendiente' | 'en_proceso' | 'completada' | 'pausada';
export type TaskPriority = 'baja' | 'media' | 'alta' | 'urgente';
export type ContactStatus =
  | 'sin_contactar'
  | 'contactado'
  | 'respondio'
  | 'interesado'
  | 'no_interesado'
  | 'seguimiento'
  | 'cliente'
  | 'numero_incorrecto'
  | 'no_contactar';
export type MessageAudience = 'all' | 'group' | 'employee';
export type AnnouncementCategory =
  | 'instrucciones'
  | 'proceso'
  | 'clientes'
  | 'campanas'
  | 'herramientas'
  | 'importante'
  | 'web'
  | 'general';

export interface Employee {
  id: string;
  full_name: string;
  username: string;
  email: string;
  phone: string | null;
  role: Role;
  status: EmployeeStatus;
  hire_date: string | null;
  avatar_url: string | null;
  password_set_at: string | null;
  last_login_at: string | null;
  last_activity_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  name: string | null;
  business: string | null;
  category: string | null;
  phone: string;
  whatsapp: string | null;
  city: string | null;
  status: ContactStatus;
  notes: string | null;
  website_url: string | null;
  proposed_url: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  last_contacted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Pick<Employee, 'id' | 'full_name'> | null;
}

export interface Assignment {
  id: number;
  contact_id: string;
  phone: string;
  employee_id: string;
  assigned_by: string | null;
  assigned_at: string;
  released_at: string | null;
  released_by: string | null;
  release_reason: string | null;
  employee?: Pick<Employee, 'id' | 'full_name'> | null;
  assigner?: Pick<Employee, 'id' | 'full_name'> | null;
  contact?: Pick<Contact, 'id' | 'name' | 'business' | 'status'> | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  contact_id: string | null;
  client_name: string | null;
  phone: string | null;
  assigned_to: string;
  created_by: string | null;
  assigned_at: string;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  employee_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Pick<Employee, 'id' | 'full_name'> | null;
}

export interface Message {
  id: string;
  sender_id: string | null;
  sender_name: string;
  title: string;
  body: string;
  audience: MessageAudience;
  group_id: string | null;
  employee_id: string | null;
  created_at: string;
}

export interface InboxMessage extends Message {
  read_at: string | null;
}

export interface SentMessage extends Message {
  recipients: { employee_id: string; read_at: string | null }[];
  group?: { name: string } | null;
  target?: Pick<Employee, 'id' | 'full_name'> | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  pinned: boolean;
  author_id: string | null;
  author_name: string;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementWithRead extends Announcement {
  read: boolean;
}

export interface ActivityLog {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  subject_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface EmployeeGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  members: { employee_id: string }[];
}

export interface MySummary {
  unread_messages: number;
  unread_announcements: number;
  tasks_pending: number;
  tasks_in_progress: number;
  tasks_paused: number;
  tasks_completed: number;
  tasks_overdue: number;
  contacts_total: number;
  contacts_uncontacted: number;
  contacts_followup: number;
}

export interface DashboardStats {
  employees_active: number;
  employees_inactive: number;
  employees_pending_activation: number;
  tasks_pendiente: number;
  tasks_en_proceso: number;
  tasks_pausada: number;
  tasks_completada: number;
  tasks_overdue: number;
  tasks_completed_today: number;
  contacts_total: number;
  contacts_unassigned: number;
  contacts_sin_contactar: number;
  contacts_contactados: number;
  contacts_interesados: number;
  contacts_clientes: number;
}

export interface WorkloadRow {
  employee_id: string;
  full_name: string;
  username: string;
  role: Role;
  status: EmployeeStatus;
  avatar_url: string | null;
  last_activity_at: string | null;
  last_login_at: string | null;
  password_set: boolean;
  tasks_pending: number;
  tasks_in_progress: number;
  tasks_paused: number;
  tasks_completed: number;
  tasks_completed_7d: number;
  tasks_overdue: number;
  contacts_total: number;
  contacts_uncontacted: number;
}

export interface Settings {
  default_country_code: string;
  allow_employee_contacts: boolean;
  invitation_hours: number;
  whatsapp_template: string;
  contact_categories: string[];
}

export type PhoneCheck =
  | { status: 'invalid' }
  | { status: 'free'; phone: string }
  | { status: 'mine'; phone: string; contact_id: string; contact_status: ContactStatus }
  | { status: 'unassigned'; phone: string; contact_id?: string | null; do_not_contact: boolean }
  | {
      status: 'taken';
      phone: string;
      contact_id?: string | null;
      assigned_to_name?: string | null;
      assigned_at?: string | null;
      do_not_contact: boolean;
    };
