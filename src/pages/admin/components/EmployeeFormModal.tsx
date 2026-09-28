import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { Button } from '../../../components/ui/Button';
import { SelectField, TextArea, TextField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { ROLE_OPTIONS } from '../../../config/labels';
import { createEmployee, getEmployeeNotes, updateEmployee, type EmployeeInput } from '../../../services/employees';
import type { Employee } from '../../../types/database';
import { friendlyError } from '../../../utils/errors';
import type { InviteInfo } from './InviteLinkModal';

type Props = {
  open: boolean;
  employee?: Employee | null;
  onClose: () => void;
  onSaved: (employee: Employee, invite?: InviteInfo) => void;
};

const EMPTY: EmployeeInput = { full_name: '', username: '', email: '', phone: '', role: 'employee', hire_date: '', notes: '' };

function suggestUsername(fullName: string): string {
  const parts = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/);
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : (parts[0] ?? '');
}

export function EmployeeFormModal({ open, employee, onClose, onSaved }: Props) {
  const { isAdmin, profile } = useAuth();
  const editing = !!employee;
  const [form, setForm] = useState<EmployeeInput>(EMPTY);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setUsernameTouched(editing);
    setNotesLoaded(!editing);
    if (employee) {
      setForm({
        full_name: employee.full_name,
        username: employee.username,
        email: employee.email,
        phone: employee.phone ?? '',
        role: employee.role,
        hire_date: employee.hire_date ?? '',
        notes: '',
      });
      getEmployeeNotes(employee.id)
        .then((notes) => {
          setForm((f) => ({ ...f, notes }));
          setNotesLoaded(true);
        })
        .catch(() => undefined);
    } else {
      setForm({ ...EMPTY, hire_date: new Date().toISOString().slice(0, 10) });
    }
  }, [open, employee, editing]);

  const set = (key: keyof EmployeeInput) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'full_name' && !usernameTouched) next.username = suggestUsername(value);
      return next;
    });
    if (key === 'username') setUsernameTouched(true);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (form.full_name.trim().length < 2) e.full_name = 'Escribe el nombre completo.';
    if (!/^[a-z0-9._-]{3,30}$/.test(form.username.trim().toLowerCase())) e.username = '3 a 30 caracteres: minúsculas, números, punto, guion o guion bajo.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = 'Correo inválido.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSaving(true);
    const payload: EmployeeInput = {
      ...form,
      username: form.username.trim().toLowerCase(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone?.trim() || null,
      hire_date: form.hire_date || null,
    };
    // No sobrescribir notas que aún no se cargaron.
    if (!notesLoaded) delete payload.notes;
    try {
      if (editing && employee) {
        const res = await updateEmployee(employee.id, payload);
        onSaved(res.employee);
      } else {
        const res = await createEmployee(payload);
        onSaved(res.employee, {
          url: res.invite_url,
          expiresAt: res.expires_at,
          purpose: 'activation',
          employee: res.employee,
        });
      }
    } catch (err) {
      setServerError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  // Un supervisor solo gestiona empleados; nadie cambia su propio rol.
  const canChangeRole = isAdmin && employee?.id !== profile?.id;
  const roleOptions = isAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r.value === 'employee');

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="lg"
      title={editing ? 'Editar empleado' : 'Nuevo empleado'}
      description={
        editing
          ? 'Actualiza los datos de la cuenta.'
          : 'No necesitas definir contraseña: al guardar obtendrás un enlace para que el empleado cree la suya.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="employee-form" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear empleado'}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="form-grid" noValidate>
        {serverError && <div className="alert alert-error span-2">{serverError}</div>}
        <TextField label="Nombre completo" required value={form.full_name} onChange={set('full_name')} error={errors.full_name} maxLength={120} fieldClassName="span-2" />
        <TextField
          label="Usuario"
          required
          value={form.username}
          onChange={set('username')}
          error={errors.username}
          maxLength={30}
          autoCapitalize="none"
          hint="Con este usuario inicia sesión."
        />
        <TextField label="Correo" type="email" required value={form.email} onChange={set('email')} error={errors.email} maxLength={160} />
        <TextField label="Teléfono / WhatsApp" inputMode="tel" value={form.phone ?? ''} onChange={set('phone')} maxLength={30} hint="Para enviarle la invitación por WhatsApp." />
        <SelectField
          label="Rol"
          value={form.role}
          onChange={set('role')}
          options={roleOptions}
          disabled={editing ? !canChangeRole : !isAdmin}
          hint={!isAdmin ? 'Los supervisores solo crean cuentas de empleado.' : undefined}
        />
        <TextField label="Fecha de ingreso" type="date" value={form.hire_date ?? ''} onChange={set('hire_date')} />
        <TextArea label="Notas internas" value={form.notes ?? ''} onChange={set('notes')} rows={3} maxLength={4000} fieldClassName="span-2" hint="Solo las ven administradores y supervisores." />
      </form>
    </Modal>
  );
}
