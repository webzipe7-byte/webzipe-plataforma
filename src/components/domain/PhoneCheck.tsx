import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, Info, SearchCheck, XCircle } from 'lucide-react';
import { checkPhone } from '../../services/contacts';
import type { PhoneCheck as PhoneCheckResult } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { formatDate } from '../../utils/format';
import { formatPhone } from '../../utils/phone';
import { Button } from '../ui/Button';
import { useWorkspace } from '../layout/WorkspaceProvider';

/** Mensaje claro según el resultado de verificar un número. */
export function PhoneCheckMessage({ result, staff }: { result: PhoneCheckResult; staff: boolean }) {
  const { settings } = useWorkspace();
  const cc = settings.default_country_code;
  switch (result.status) {
    case 'invalid':
      return (
        <div className="check-result is-error">
          <XCircle size={18} /> El número no es válido. Revisa que tenga 10 dígitos (o el indicativo del país).
        </div>
      );
    case 'free':
      return (
        <div className="check-result is-ok">
          <CheckCircle2 size={18} /> {formatPhone(result.phone, cc)} está libre: no está registrado en el sistema.
        </div>
      );
    case 'mine':
      return (
        <div className="check-result is-info">
          <Info size={18} /> {formatPhone(result.phone, cc)} ya está en tus contactos.
        </div>
      );
    case 'unassigned':
      return (
        <div className="check-result is-warning">
          <AlertTriangle size={18} /> {formatPhone(result.phone, cc)} ya existe en el sistema pero no tiene responsable.
          {staff ? ' Puedes asignarlo desde Contactos.' : ' Pídele al administrador que te lo asigne.'}
          {result.do_not_contact && ' Está marcado como NO CONTACTAR.'}
        </div>
      );
    case 'taken':
      return (
        <div className="check-result is-error">
          <AlertTriangle size={18} />
          <span>
            <strong>Este número ya está asignado a {staff && result.assigned_to_name ? result.assigned_to_name : 'otro empleado'}</strong>
            {staff && result.assigned_at ? ` desde el ${formatDate(result.assigned_at)}` : ''}. No lo contactes para evitar duplicar el trabajo.
            {result.do_not_contact && ' Además está marcado como NO CONTACTAR.'}
          </span>
        </div>
      );
  }
}

/** Herramienta "Verificar número" para empleados y administradores. */
export function PhoneCheckTool({ staff = false }: { staff?: boolean }) {
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<PhoneCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await checkPhone(phone));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="phone-check">
      <form onSubmit={submit} className="phone-check-form">
        <input
          className="input"
          inputMode="tel"
          placeholder="Ej. 300 123 4567"
          aria-label="Número a verificar"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setResult(null);
          }}
          maxLength={25}
        />
        <Button type="submit" variant="primary" icon={<SearchCheck size={16} />} loading={loading}>
          Verificar
        </Button>
      </form>
      {error && <div className="check-result is-error">{error}</div>}
      {result && <PhoneCheckMessage result={result} staff={staff} />}
    </div>
  );
}
