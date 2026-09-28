import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useConfirm } from '../../../components/ui/Feedback';
import { Field, SelectField, TextArea, TextField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS, TASK_STATUS_OPTIONS } from '../../../config/labels';
import { getContact } from '../../../services/contacts';
import { createTask, findOpenDuplicate, updateTask, type TaskInput } from '../../../services/tasks';
import type { Contact, Task, TaskPriority, TaskStatus } from '../../../types/database';
import { friendlyError } from '../../../utils/errors';
import { formatDate } from '../../../utils/format';
import { ContactPicker } from './ContactPicker';
import { useEmployeeOptions } from './useEmployeeOptions';

type Props = {
  open: boolean;
  task?: Task | null;
  /** Valores iniciales al crear (p. ej. desde la ficha de un empleado o contacto). */
  defaults?: { assigned_to?: string; contact?: Contact | null };
  onClose: () => void;
  onSaved: (task: Task) => void;
};

type FormState = {
  title: string;
  description: string;
  assigned_to: string;
  phone: string;
  client_name: string;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
};

const EMPTY: FormState = { title: '', description: '', assigned_to: '', phone: '', client_name: '', due_date: '', priority: 'media', status: 'pendiente' };

export function TaskFormModal({ open, task, defaults, onClose, onSaved }: Props) {
  const confirm = useConfirm();
  const { options, byId } = useEmployeeOptions();
  const editing = !!task;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [contact, setContact] = useState<Contact | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Los valores iniciales solo se leen al abrir (evita reiniciar el formulario en cada render).
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    if (task) {
      setForm({
        title: task.title,
        description: task.description ?? '',
        assigned_to: task.assigned_to,
        phone: task.contact_id ? '' : (task.phone ?? ''),
        client_name: task.contact_id ? '' : (task.client_name ?? ''),
        due_date: task.due_date ?? '',
        priority: task.priority,
        status: task.status,
      });
      setContact(null);
      if (task.contact_id) getContact(task.contact_id).then(setContact).catch(() => setContact(null));
    } else {
      setForm({ ...EMPTY, assigned_to: defaultsRef.current?.assigned_to ?? '' });
      setContact(defaultsRef.current?.contact ?? null);
    }
  }, [open, task]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const contactOwnerMismatch = contact && contact.assigned_to && form.assigned_to && contact.assigned_to !== form.assigned_to;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (form.title.trim().length < 2) errs.title = 'Escribe el nombre de la tarea.';
    if (!form.assigned_to) errs.assigned_to = 'Selecciona el empleado.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const duplicate = await findOpenDuplicate(form.title, form.assigned_to, task?.id);
      if (duplicate) {
        const ok = await confirm({
          title: 'Esta tarea ya fue asignada',
          message: `${byId(form.assigned_to)?.full_name ?? 'El empleado'} ya tiene una tarea abierta llamada «${duplicate.title}» (${TASK_STATUS[duplicate.status].label.toLowerCase()}, asignada el ${formatDate(duplicate.assigned_at)}). ¿Crear otra de todas formas?`,
          confirmLabel: 'Sí, continuar',
        });
        if (!ok) return;
      }
      if (contactOwnerMismatch) {
        const ok = await confirm({
          title: 'El contacto pertenece a otro empleado',
          message: `${contact?.assignee?.full_name ?? 'Otro empleado'} tiene asignado este contacto. Asignar la tarea a ${byId(form.assigned_to)?.full_name} puede duplicar el trabajo. ¿Continuar?`,
          confirmLabel: 'Continuar',
          danger: true,
        });
        if (!ok) return;
      }

      const payload: TaskInput = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_to: form.assigned_to,
        contact_id: contact?.id ?? null,
        phone: contact ? contact.phone : form.phone.trim() || null,
        client_name: contact ? null : form.client_name.trim() || null,
        due_date: form.due_date || null,
        priority: form.priority,
        ...(editing ? { status: form.status } : {}),
      };
      const saved = editing && task ? await updateTask(task.id, payload) : await createTask(payload);
      onSaved(saved);
    } catch (err) {
      setServerError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      title={editing ? 'Editar tarea' : 'Asignar tarea'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="task-form" loading={saving}>
            {editing ? 'Guardar cambios' : 'Asignar tarea'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="form-grid" noValidate>
        {serverError && <div className="alert alert-error span-2">{serverError}</div>}
        <TextField label="Nombre de la tarea" required value={form.title} onChange={set('title')} error={errors.title} maxLength={160} fieldClassName="span-2" placeholder="Ej. Enviar propuesta de página web" />
        <TextArea label="Descripción / instrucciones" value={form.description} onChange={set('description')} rows={3} maxLength={4000} fieldClassName="span-2" />
        <SelectField label="Empleado" required value={form.assigned_to} onChange={set('assigned_to')} options={options} placeholder="Selecciona…" error={errors.assigned_to} />
        <SelectField label="Prioridad" value={form.priority} onChange={set('priority')} options={TASK_PRIORITY_OPTIONS} />
        <TextField label="Fecha límite" type="date" value={form.due_date} onChange={set('due_date')} />
        {editing ? (
          <SelectField label="Estado" value={form.status} onChange={set('status')} options={TASK_STATUS_OPTIONS} />
        ) : (
          <div />
        )}
        <Field label="Cliente (opcional)" className="span-2" hint="Vincula un contacto existente: el número y el nombre se copian automáticamente.">
          {() => <ContactPicker value={contact} onChange={setContact} />}
        </Field>
        {contactOwnerMismatch && (
          <div className="check-result is-warning span-2">
            <AlertTriangle size={18} /> Este contacto está asignado a {contact?.assignee?.full_name}, no al empleado seleccionado.
          </div>
        )}
        {!contact && (
          <>
            <TextField label="Nombre del cliente" value={form.client_name} onChange={set('client_name')} maxLength={160} />
            <TextField label="Número de teléfono" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={25} />
          </>
        )}
      </form>
    </Modal>
  );
}
