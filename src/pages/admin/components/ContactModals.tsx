import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Upload } from 'lucide-react';
import { useWorkspace } from '../../../components/layout/WorkspaceProvider';
import { PhoneCheckMessage } from '../../../components/domain/PhoneCheck';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Feedback';
import { SelectField, TextArea, TextField } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { CONTACT_STATUS_OPTIONS } from '../../../config/labels';
import {
  bulkAssign,
  checkPhone,
  createContact,
  importContacts,
  parseImportText,
  updateContact,
  type ContactInput,
} from '../../../services/contacts';
import type { Contact, ContactStatus, PhoneCheck } from '../../../types/database';
import { friendlyError } from '../../../utils/errors';
import { formatPhone, normalizePhone } from '../../../utils/phone';
import { useAdminActions } from './useAdminActions';
import { useEmployeeOptions } from './useEmployeeOptions';

// ---------------------------------------------------------------------
// Crear / editar contacto
// ---------------------------------------------------------------------
type FormState = Required<{ [K in keyof ContactInput]: string }> & { status: ContactStatus };

const EMPTY: FormState = {
  name: '',
  business: '',
  category: '',
  phone: '',
  whatsapp: '',
  city: '',
  status: 'sin_contactar',
  notes: '',
  website_url: '',
  proposed_url: '',
};

export function ContactFormModal({ open, contact, onClose, onSaved }: { open: boolean; contact?: Contact | null; onClose: () => void; onSaved: (c: Contact) => void }) {
  const { settings } = useWorkspace();
  const { options, byId } = useEmployeeOptions();
  const { assign } = useAdminActions();
  const editing = !!contact;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [assignTo, setAssignTo] = useState('');
  const [check, setCheck] = useState<PhoneCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCheck(null);
    setAssignTo('');
    setForm(
      contact
        ? {
            name: contact.name ?? '',
            business: contact.business ?? '',
            category: contact.category ?? '',
            phone: contact.phone,
            whatsapp: contact.whatsapp ?? '',
            city: contact.city ?? '',
            status: contact.status,
            notes: contact.notes ?? '',
            website_url: contact.website_url ?? '',
            proposed_url: contact.proposed_url ?? '',
          }
        : EMPTY,
    );
  }, [open, contact]);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (key === 'phone') setCheck(null);
  };

  const verify = async () => {
    if (!form.phone.trim()) return;
    try {
      setCheck(await checkPhone(form.phone));
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!normalizePhone(form.phone, settings.default_country_code)) {
      setCheck({ status: 'invalid' });
      return;
    }
    setSaving(true);
    try {
      const phoneChanged = !contact || normalizePhone(form.phone, settings.default_country_code) !== contact.phone;
      if (phoneChanged) {
        const result = await checkPhone(form.phone);
        if (result.status !== 'free' && !(result.status === 'mine')) {
          setCheck(result);
          setError('Ese número ya existe en el sistema. Búscalo en la lista para editarlo o reasignarlo.');
          return;
        }
      }
      const payload: ContactInput = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]),
      ) as unknown as ContactInput;
      payload.phone = form.phone;
      let saved = editing && contact ? await updateContact(contact.id, payload) : await createContact(payload);
      if (!editing && assignTo) {
        const emp = byId(assignTo);
        if (emp && (await assign(saved, emp))) saved = { ...saved, assigned_to: emp.id, assignee: { id: emp.id, full_name: emp.full_name } };
      }
      onSaved(saved);
    } catch (err) {
      setError(friendlyError(err));
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
      title={editing ? 'Editar contacto' : 'Nuevo contacto'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="contact-form" loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear contacto'}
          </Button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} className="form-grid" noValidate>
        {error && <div className="alert alert-error span-2">{error}</div>}
        <div className="field span-2">
          <label className="field-label" htmlFor="contact-phone">
            Número de teléfono <span className="field-required">*</span>
          </label>
          <div className="inline-field">
            <input id="contact-phone" className="input" inputMode="tel" value={form.phone} onChange={set('phone')} onBlur={verify} maxLength={25} placeholder="300 123 4567" />
            <Button variant="secondary" onClick={verify}>
              Verificar
            </Button>
          </div>
          {form.phone && normalizePhone(form.phone, settings.default_country_code) && (
            <p className="field-hint">Se guardará como {formatPhone(normalizePhone(form.phone, settings.default_country_code), settings.default_country_code)}</p>
          )}
        </div>
        {check && (!editing || check.status !== 'mine') && (
          <div className="span-2">
            <PhoneCheckMessage result={check} staff />
          </div>
        )}
        <TextField label="Negocio / empresa" value={form.business} onChange={set('business')} maxLength={160} />
        <TextField label="Nombre de contacto" value={form.name} onChange={set('name')} maxLength={120} />
        <SelectField
          label="Categoría"
          value={form.category}
          onChange={set('category')}
          placeholder="Sin categoría"
          options={Array.from(new Set([...settings.contact_categories, ...(form.category ? [form.category] : [])])).map((c) => ({ value: c, label: c }))}
        />
        <TextField label="Ciudad" value={form.city} onChange={set('city')} maxLength={80} />
        <TextField label="WhatsApp (si es distinto)" inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} maxLength={25} />
        <SelectField label="Estado" value={form.status} onChange={set('status')} options={CONTACT_STATUS_OPTIONS} />
        <TextField label="Página web existente" value={form.website_url} onChange={set('website_url')} maxLength={300} placeholder="https://…" />
        <TextField label="Página WebZipe propuesta" value={form.proposed_url} onChange={set('proposed_url')} maxLength={300} placeholder="https://…" />
        <TextArea label="Observaciones" value={form.notes} onChange={set('notes')} rows={3} maxLength={4000} fieldClassName="span-2" />
        {!editing && (
          <SelectField label="Asignar a" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} options={options} placeholder="Sin asignar por ahora" fieldClassName="span-2" />
        )}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Asignar uno o varios contactos
// ---------------------------------------------------------------------
export function AssignModal({ contacts, onClose, onDone }: { contacts: Contact[]; onClose: () => void; onDone: () => void }) {
  const { options, byId } = useEmployeeOptions();
  const { assign } = useAdminActions();
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [saving, setSaving] = useState(false);
  const single = contacts.length === 1;
  const alreadyTaken = contacts.filter((c) => c.assigned_to && c.assigned_to !== employeeId);
  const [forceTaken, setForceTaken] = useState(false);

  useEffect(() => {
    setEmployeeId('');
    setForceTaken(false);
  }, [contacts]);

  const submit = async () => {
    const emp = byId(employeeId);
    if (!emp) return;
    setSaving(true);
    try {
      if (single) {
        if (await assign(contacts[0], emp)) onDone();
      } else {
        const res = await bulkAssign(
          contacts.map((c) => c.id),
          emp.id,
          forceTaken,
        );
        toast.success(
          `${res.assigned} contactos asignados a ${emp.full_name}`,
          res.skipped_taken || res.skipped_dnc
            ? `Se omitieron ${res.skipped_taken} ya asignados a otra persona y ${res.skipped_dnc} marcados «No contactar».`
            : undefined,
        );
        onDone();
      }
    } catch (err) {
      toast.error('No se pudo asignar', friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={contacts.length > 0}
      onClose={onClose}
      busy={saving}
      size="sm"
      title={single ? 'Asignar contacto' : `Asignar ${contacts.length} contactos`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={!employeeId} loading={saving}>
            Asignar
          </Button>
        </>
      }
    >
      <SelectField label="Empleado responsable" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} options={options} placeholder="Selecciona…" />
      {!single && alreadyTaken.length > 0 && employeeId && (
        <label className="checkbox-row">
          <input type="checkbox" checked={forceTaken} onChange={(e) => setForceTaken(e.target.checked)} />
          <span>
            {alreadyTaken.length} de los seleccionados ya tienen responsable. Marca esta casilla para <strong>reasignarlos</strong> también (si no, se
            omiten).
          </span>
        </label>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Importar números
// ---------------------------------------------------------------------
export function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { settings } = useWorkspace();
  const { options } = useEmployeeOptions();
  const toast = useToast();
  const [text, setText] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ inserted: number; duplicates: string[]; invalid: string[] } | null>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setResult(null);
      setAssignTo('');
    }
  }, [open]);

  const rows = useMemo(() => parseImportText(text), [text]);
  const valid = rows.filter((r) => normalizePhone(r.phone ?? '', settings.default_country_code));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error('Archivo demasiado grande', 'Máximo 2 MB.');
      return;
    }
    setText(await file.text());
  };

  const submit = async () => {
    setSaving(true);
    try {
      const res = await importContacts(rows.slice(0, 2000), assignTo || null);
      setResult(res);
      toast.success(`${res.inserted} contactos importados`);
      onDone();
    } catch (err) {
      toast.error('No se pudo importar', friendlyError(err));
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
      title="Importar números"
      description="Pega una lista o sube un archivo CSV. Una fila por contacto: teléfono, negocio, nombre, categoría, ciudad, observaciones (solo el teléfono es obligatorio)."
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" icon={<Upload size={16} />} onClick={submit} disabled={!valid.length} loading={saving}>
              Importar {valid.length || ''}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="import-result">
          <p>
            <strong>{result.inserted}</strong> contactos nuevos creados.
          </p>
          {result.duplicates.length > 0 && (
            <p>
              <strong>{result.duplicates.length}</strong> ya existían y se omitieron (no se duplican ni cambian de responsable):{' '}
              <span className="mono small">{result.duplicates.slice(0, 20).map((p) => formatPhone(p, settings.default_country_code)).join(', ')}</span>
              {result.duplicates.length > 20 && '…'}
            </p>
          )}
          {result.invalid.length > 0 && (
            <p>
              <strong>{result.invalid.length}</strong> filas con número inválido: <span className="mono small">{result.invalid.slice(0, 20).join(', ')}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="form-stack">
          <TextArea
            label="Lista de contactos"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'3001234567, Café Aroma, Laura, Cafetería, Pasto\n3109876543; Barbería Norte; Carlos'}
          />
          <label className="file-input">
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
            <Upload size={16} /> Cargar archivo CSV
          </label>
          <SelectField label="Asignar todos a" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} options={options} placeholder="Nadie (quedan sin asignar)" />
          {rows.length > 0 && (
            <p className="text-mute small">
              {rows.length} filas detectadas · {valid.length} con número válido
              {rows.length > 2000 && ' · solo se importarán las primeras 2000'}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
