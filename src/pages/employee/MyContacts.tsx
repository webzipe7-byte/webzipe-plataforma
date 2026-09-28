import { useMemo, useState, type FormEvent } from 'react';
import { SearchCheck, UserPlus, Users } from 'lucide-react';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { ContactCard } from '../../components/domain/ContactCard';
import { PhoneCheckMessage, PhoneCheckTool } from '../../components/domain/PhoneCheck';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Feedback';
import { SelectField, TextArea, TextField } from '../../components/ui/Field';
import { Card, ChipTabs, EmptyState, ErrorState, PageHeader, SearchInput } from '../../components/ui/Misc';
import { Modal } from '../../components/ui/Modal';
import { SectionLoader } from '../../components/ui/Spinner';
import { CONTACT_STATUS } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { checkPhone, claimNewContact, listMyContacts, updateMyContact, type ContactInput } from '../../services/contacts';
import type { Contact, ContactStatus, PhoneCheck } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { normalizePhone } from '../../utils/phone';

type Filter = 'todos' | 'por_contactar' | 'en_curso' | 'clientes' | 'cerrados';

const GROUPS: Record<Exclude<Filter, 'todos'>, ContactStatus[]> = {
  por_contactar: ['sin_contactar'],
  en_curso: ['contactado', 'respondio', 'interesado', 'seguimiento'],
  clientes: ['cliente'],
  cerrados: ['no_interesado', 'numero_incorrecto', 'no_contactar'],
};

const EMPTY: ContactInput = { phone: '', name: '', business: '', category: '', city: '', notes: '', website_url: '' };

export function MyContacts() {
  const toast = useToast();
  const { settings, liveVersion, refreshSummary } = useWorkspace();
  const { data, loading, error, reload, setData } = useAsync(listMyContacts, [liveVersion]);
  const [filter, setFilter] = useState<Filter>('todos');
  const [search, setSearch] = useState('');
  const [checkOpen, setCheckOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [formCheck, setFormCheck] = useState<PhoneCheck | null>(null);
  const [saving, setSaving] = useState(false);

  const contacts = data ?? [];
  const count = (f: Filter) => (f === 'todos' ? contacts.length : contacts.filter((c) => GROUPS[f].includes(c.status)).length);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = search.replace(/\D/g, '');
    return contacts.filter((c) => {
      if (filter !== 'todos' && !GROUPS[filter].includes(c.status)) return false;
      if (!q) return true;
      return (
        [c.name, c.business, c.city, c.category, c.notes].some((v) => v?.toLowerCase().includes(q)) ||
        (digits.length >= 3 && c.phone.includes(digits))
      );
    });
  }, [contacts, filter, search]);

  const onUpdate = async (contact: Contact, status: ContactStatus | null, notes: string | null) => {
    try {
      await updateMyContact(contact.id, status, notes);
      setData((list) =>
        (list ?? []).map((c) =>
          c.id === contact.id
            ? {
                ...c,
                status: status ?? c.status,
                notes: notes ?? c.notes,
                last_contacted_at: status && status !== 'sin_contactar' ? new Date().toISOString() : c.last_contacted_at,
              }
            : c,
        ),
      );
      toast.success(status ? `Estado: ${CONTACT_STATUS[status].label}` : 'Observaciones guardadas');
      void refreshSummary();
    } catch (err) {
      toast.error('No se pudo guardar', friendlyError(err));
      throw err;
    }
  };

  const set = (key: keyof ContactInput) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (key === 'phone') setFormCheck(null);
  };

  const submitNew = async (e: FormEvent) => {
    e.preventDefault();
    if (!normalizePhone(form.phone, settings.default_country_code)) {
      setFormCheck({ status: 'invalid' });
      return;
    }
    setSaving(true);
    try {
      // Primero se verifica: si el número pertenece a otro empleado se muestra la advertencia.
      const check = await checkPhone(form.phone);
      if (check.status !== 'free') {
        setFormCheck(check);
        return;
      }
      const res = await claimNewContact(form);
      if (!res.ok) {
        setFormCheck(res.code === 'invalid' ? { status: 'invalid' } : await checkPhone(form.phone));
        return;
      }
      toast.success('Contacto registrado', 'Quedó asignado a ti.');
      setNewOpen(false);
      setForm(EMPTY);
      setFormCheck(null);
      void reload(true);
      void refreshSummary();
    } catch (err) {
      toast.error('No se pudo registrar', friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Mis contactos"
        subtitle="Clientes y números asignados a ti. Escríbeles por WhatsApp y actualiza su estado."
        actions={
          <>
            <Button variant="secondary" icon={<SearchCheck size={16} />} onClick={() => setCheckOpen(true)}>
              Verificar número
            </Button>
            {settings.allow_employee_contacts && (
              <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setNewOpen(true)}>
                Registrar contacto
              </Button>
            )}
          </>
        }
      />

      <div className="toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, negocio, ciudad o número…" />
      </div>
      <ChipTabs
        label="Filtrar contactos"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'todos', label: 'Todos', count: count('todos') },
          { value: 'por_contactar', label: 'Por contactar', count: count('por_contactar') },
          { value: 'en_curso', label: 'En conversación', count: count('en_curso') },
          { value: 'clientes', label: 'Clientes', count: count('clientes') },
          { value: 'cerrados', label: 'Cerrados', count: count('cerrados') },
        ]}
      />

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : visible.length ? (
        <div className="card-grid">
          {visible.map((c) => (
            <ContactCard key={c.id} contact={c} onUpdate={onUpdate} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users size={24} />} title={search ? 'Sin resultados' : 'No hay contactos aquí'}>
          {search ? 'Prueba con otra búsqueda.' : 'Cuando el administrador te asigne contactos, aparecerán aquí.'}
        </EmptyState>
      )}

      <Modal open={checkOpen} onClose={() => setCheckOpen(false)} title="Verificar número" description="Antes de escribirle a un número nuevo, confirma que nadie más lo esté trabajando." size="sm">
        <PhoneCheckTool />
      </Modal>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        busy={saving}
        title="Registrar contacto"
        description="Si conseguiste un número nuevo, regístralo aquí. Quedará asignado a ti y nadie más podrá tomarlo."
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="new-contact-form" loading={saving}>
              Registrar
            </Button>
          </>
        }
      >
        <form id="new-contact-form" onSubmit={submitNew} className="form-grid">
          <TextField label="Número de teléfono" required inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="300 123 4567" maxLength={25} fieldClassName="span-2" />
          {formCheck && (
            <div className="span-2">
              <PhoneCheckMessage result={formCheck} staff={false} />
            </div>
          )}
          <TextField label="Negocio / empresa" value={form.business ?? ''} onChange={set('business')} maxLength={160} />
          <TextField label="Nombre de la persona" value={form.name ?? ''} onChange={set('name')} maxLength={120} />
          <SelectField label="Categoría" value={form.category ?? ''} onChange={set('category')} placeholder="Sin categoría" options={settings.contact_categories.map((c) => ({ value: c, label: c }))} />
          <TextField label="Ciudad" value={form.city ?? ''} onChange={set('city')} maxLength={80} />
          <TextField label="Página web actual (si tiene)" value={form.website_url ?? ''} onChange={set('website_url')} maxLength={300} fieldClassName="span-2" placeholder="https://…" />
          <TextArea label="Observaciones" value={form.notes ?? ''} onChange={set('notes')} rows={3} maxLength={4000} fieldClassName="span-2" />
        </form>
      </Modal>

      <Card className="card-subtle">
        <p className="text-mute small">
          Consejo: al tocar <strong>WhatsApp</strong> se abre la conversación con un mensaje sugerido por WebZipe. Después, cambia el estado del
          contacto para que el administrador vea tu avance.
        </p>
      </Card>
    </div>
  );
}
