import type {
  AnnouncementCategory,
  ContactStatus,
  EmployeeStatus,
  MessageAudience,
  Role,
  TaskPriority,
  TaskStatus,
} from '../types/database';

/** Tonos visuales disponibles para Badge. */
export type Tone = 'neutral' | 'blue' | 'gold' | 'green' | 'red' | 'amber' | 'violet' | 'teal' | 'muted';

type Option<T extends string> = { value: T; label: string; tone: Tone };

function toMap<T extends string>(list: Option<T>[]) {
  return Object.fromEntries(list.map((o) => [o.value, o])) as Record<T, Option<T>>;
}

export const ROLE_OPTIONS: Option<Role>[] = [
  { value: 'employee', label: 'Empleado', tone: 'neutral' },
  { value: 'supervisor', label: 'Supervisor', tone: 'blue' },
  { value: 'admin', label: 'Administrador', tone: 'gold' },
];
export const ROLES = toMap(ROLE_OPTIONS);

export const EMPLOYEE_STATUS_OPTIONS: Option<EmployeeStatus>[] = [
  { value: 'active', label: 'Activo', tone: 'green' },
  { value: 'inactive', label: 'Inactivo', tone: 'muted' },
];
export const EMPLOYEE_STATUS = toMap(EMPLOYEE_STATUS_OPTIONS);

export const TASK_STATUS_OPTIONS: Option<TaskStatus>[] = [
  { value: 'pendiente', label: 'Pendiente', tone: 'amber' },
  { value: 'en_proceso', label: 'En proceso', tone: 'blue' },
  { value: 'pausada', label: 'Pausada', tone: 'muted' },
  { value: 'completada', label: 'Completada', tone: 'green' },
];
export const TASK_STATUS = toMap(TASK_STATUS_OPTIONS);

export const TASK_PRIORITY_OPTIONS: Option<TaskPriority>[] = [
  { value: 'baja', label: 'Baja', tone: 'muted' },
  { value: 'media', label: 'Media', tone: 'neutral' },
  { value: 'alta', label: 'Alta', tone: 'amber' },
  { value: 'urgente', label: 'Urgente', tone: 'red' },
];
export const TASK_PRIORITY = toMap(TASK_PRIORITY_OPTIONS);
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = { urgente: 0, alta: 1, media: 2, baja: 3 };

export const CONTACT_STATUS_OPTIONS: Option<ContactStatus>[] = [
  { value: 'sin_contactar', label: 'Sin contactar', tone: 'neutral' },
  { value: 'contactado', label: 'Contactado', tone: 'blue' },
  { value: 'respondio', label: 'Respondió', tone: 'teal' },
  { value: 'interesado', label: 'Interesado', tone: 'gold' },
  { value: 'seguimiento', label: 'Seguimiento', tone: 'violet' },
  { value: 'cliente', label: 'Cliente', tone: 'green' },
  { value: 'no_interesado', label: 'No interesado', tone: 'muted' },
  { value: 'numero_incorrecto', label: 'Número incorrecto', tone: 'red' },
  { value: 'no_contactar', label: 'No contactar', tone: 'red' },
];
export const CONTACT_STATUS = toMap(CONTACT_STATUS_OPTIONS);

export const AUDIENCE_LABEL: Record<MessageAudience, string> = {
  all: 'Todos los empleados',
  group: 'Grupo',
  employee: 'Empleado',
};

export const ANNOUNCEMENT_CATEGORY_OPTIONS: Option<AnnouncementCategory>[] = [
  { value: 'importante', label: 'Importante', tone: 'red' },
  { value: 'instrucciones', label: 'Nuevas instrucciones', tone: 'gold' },
  { value: 'proceso', label: 'Proceso de trabajo', tone: 'blue' },
  { value: 'clientes', label: 'Nuevos clientes', tone: 'green' },
  { value: 'campanas', label: 'Campañas', tone: 'violet' },
  { value: 'herramientas', label: 'Herramientas', tone: 'teal' },
  { value: 'web', label: 'Página de WebZipe', tone: 'blue' },
  { value: 'general', label: 'General', tone: 'neutral' },
];
export const ANNOUNCEMENT_CATEGORY = toMap(ANNOUNCEMENT_CATEGORY_OPTIONS);

/** Etiquetas del registro de actividad. */
export const ACTIVITY_ACTIONS: Record<string, { label: string; tone: Tone }> = {
  login: { label: 'Inicio de sesión', tone: 'neutral' },
  account_activated: { label: 'Cuenta activada', tone: 'green' },
  password_reset: { label: 'Contraseña restablecida', tone: 'blue' },
  employee_created: { label: 'Empleado creado', tone: 'gold' },
  employee_updated: { label: 'Empleado editado', tone: 'blue' },
  employee_deactivated: { label: 'Empleado desactivado', tone: 'red' },
  employee_reactivated: { label: 'Empleado reactivado', tone: 'green' },
  invitation_created: { label: 'Enlace generado', tone: 'violet' },
  task_assigned: { label: 'Tarea asignada', tone: 'gold' },
  task_reassigned: { label: 'Tarea reasignada', tone: 'violet' },
  task_status: { label: 'Tarea actualizada', tone: 'blue' },
  task_completed: { label: 'Tarea completada', tone: 'green' },
  contact_assigned: { label: 'Contacto asignado', tone: 'gold' },
  contact_reassigned: { label: 'Contacto reasignado', tone: 'violet' },
  contact_released: { label: 'Número liberado', tone: 'muted' },
  contact_updated: { label: 'Contacto actualizado', tone: 'teal' },
  contacts_imported: { label: 'Importación', tone: 'blue' },
  number_conflict: { label: 'Número en conflicto', tone: 'red' },
  message_sent: { label: 'Mensaje enviado', tone: 'blue' },
  announcement_published: { label: 'Actualización publicada', tone: 'gold' },
};
