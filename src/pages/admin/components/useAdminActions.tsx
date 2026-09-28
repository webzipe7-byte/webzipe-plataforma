import { useCallback } from 'react';
import { useConfirm, useToast } from '../../../components/ui/Feedback';
import { assignContact } from '../../../services/contacts';
import { setEmployeeStatus } from '../../../services/employees';
import type { Contact, Employee } from '../../../types/database';
import { friendlyError } from '../../../utils/errors';
import { contactTitle, formatDate } from '../../../utils/format';

/**
 * Acciones administrativas con confirmaciones que previenen errores:
 * reasignar números ajenos, desactivar empleados, etc.
 */
export function useAdminActions() {
  const confirm = useConfirm();
  const toast = useToast();

  /** Asigna un contacto; si ya pertenece a otro empleado pide confirmación antes de reasignar. */
  const assign = useCallback(
    async (contact: Pick<Contact, 'id' | 'name' | 'business' | 'phone'>, employee: { id: string; full_name: string }): Promise<boolean> => {
      try {
        let res = await assignContact(contact.id, employee.id);
        if (!res.ok) {
          const ok = await confirm({
            title: res.code === 'already_assigned' ? 'Este número ya está asignado' : 'Contacto marcado como «No contactar»',
            message:
              res.code === 'already_assigned' ? (
                <>
                  <p>
                    <strong>{contactTitle(contact)}</strong> está asignado a <strong>{res.assigned_to_name}</strong>
                    {res.assigned_at ? ` desde el ${formatDate(res.assigned_at)}` : ''}.
                  </p>
                  <p>¿Quieres reasignarlo a {employee.full_name}? {res.do_not_contact && 'Además, está marcado como NO CONTACTAR.'}</p>
                </>
              ) : (
                <p>
                  <strong>{contactTitle(contact)}</strong> pidió no ser contactado. ¿Asignarlo de todas formas a {employee.full_name}?
                </p>
              ),
            confirmLabel: res.code === 'already_assigned' ? 'Sí, reasignar' : 'Asignar de todas formas',
            danger: true,
          });
          if (!ok) return false;
          res = await assignContact(contact.id, employee.id, true, `Reasignado a ${employee.full_name}`);
        }
        if (res.ok && !res.unchanged) toast.success('Contacto asignado', `${contactTitle(contact)} → ${employee.full_name}`);
        if (res.ok && res.unchanged) toast.info('Sin cambios', `Ya estaba asignado a ${employee.full_name}.`);
        return res.ok;
      } catch (err) {
        toast.error('No se pudo asignar', friendlyError(err));
        return false;
      }
    },
    [confirm, toast],
  );

  /** Desactiva o reactiva un empleado con confirmación. */
  const toggleStatus = useCallback(
    async (employee: Employee): Promise<Employee | null> => {
      const deactivating = employee.status === 'active';
      let release = false;
      if (deactivating) {
        const ok = await confirm({
          title: '¿Estás seguro de que deseas desactivar este empleado?',
          message: (
            <>
              <p>
                <strong>{employee.full_name}</strong> no podrá iniciar sesión ni ver información hasta que lo reactives. Sus tareas y su historial se
                conservan.
              </p>
            </>
          ),
          confirmLabel: 'Desactivar',
          danger: true,
        });
        if (!ok) return null;
        release = await confirm({
          title: '¿Liberar sus contactos?',
          message: 'Si liberas sus números, quedarán sin responsable para que puedas asignarlos a otra persona. Si no, seguirán a su nombre.',
          confirmLabel: 'Sí, liberar números',
          cancelLabel: 'No, mantenerlos',
        });
      } else {
        const ok = await confirm({
          title: `¿Reactivar a ${employee.full_name}?`,
          message: 'Podrá volver a iniciar sesión con su contraseña.',
          confirmLabel: 'Reactivar',
        });
        if (!ok) return null;
      }
      try {
        const res = await setEmployeeStatus(employee.id, deactivating ? 'inactive' : 'active', release);
        toast.success(
          deactivating ? 'Empleado desactivado' : 'Empleado reactivado',
          release && res.released ? `Se liberaron ${res.released} números.` : undefined,
        );
        return res.employee;
      } catch (err) {
        toast.error('No se pudo cambiar el estado', friendlyError(err));
        return null;
      }
    },
    [confirm, toast],
  );

  return { assign, toggleStatus };
}
