import { useState } from 'react';
import { Building2, MapPin, NotebookPen, Tag } from 'lucide-react';
import { CONTACT_STATUS, CONTACT_STATUS_OPTIONS } from '../../config/labels';
import type { Contact, ContactStatus } from '../../types/database';
import { contactTitle, formatDate, timeAgo } from '../../utils/format';
import { formatPhone } from '../../utils/phone';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Feedback';
import { Modal } from '../ui/Modal';
import { TextArea } from '../ui/Field';
import { ContactActions } from './ContactActions';
import { useWorkspace } from '../layout/WorkspaceProvider';

type Props = {
  contact: Contact;
  onUpdate: (contact: Contact, status: ContactStatus | null, notes: string | null) => Promise<void>;
};

export function ContactCard({ contact, onUpdate }: Props) {
  const { settings } = useWorkspace();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(contact.notes ?? '');
  const status = CONTACT_STATUS[contact.status];
  const blocked = contact.status === 'no_contactar' || contact.status === 'numero_incorrecto';

  const save = async (nextStatus: ContactStatus | null, nextNotes: string | null) => {
    setSaving(true);
    try {
      await onUpdate(contact, nextStatus, nextNotes);
      setEditingNotes(false);
    } finally {
      setSaving(false);
    }
  };

  const onReach = () => {
    if (contact.status === 'sin_contactar') {
      toast.info('¿Ya le escribiste?', 'Actualiza el estado para llevar el control.', {
        label: 'Marcar como contactado',
        onClick: () => void save('contactado', null),
      });
    }
  };

  return (
    <article className={`contact-card tone-${status.tone}`}>
      <header className="contact-card-head">
        <div className="contact-title">
          <h3>{contactTitle(contact)}</h3>
          {contact.business && contact.name && <span className="contact-person">{contact.name}</span>}
        </div>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </header>

      <div className="contact-phone mono">{formatPhone(contact.phone, settings.default_country_code)}</div>

      <ul className="contact-meta">
        {contact.category && (
          <li>
            <Tag size={14} /> {contact.category}
          </li>
        )}
        {contact.city && (
          <li>
            <MapPin size={14} /> {contact.city}
          </li>
        )}
        <li>
          <Building2 size={14} /> Asignado {formatDate(contact.assigned_at)}
        </li>
        {contact.last_contacted_at && <li>Último contacto: {timeAgo(contact.last_contacted_at)}</li>}
      </ul>

      {contact.notes && <p className="contact-notes">{contact.notes}</p>}

      {blocked ? (
        <p className="contact-blocked">{contact.status === 'no_contactar' ? 'Este contacto pidió no ser contactado.' : 'El número está marcado como incorrecto.'}</p>
      ) : (
        <ContactActions
          phone={contact.phone}
          whatsapp={contact.whatsapp}
          name={contact.name}
          business={contact.business}
          websiteUrl={contact.website_url}
          proposedUrl={contact.proposed_url}
          onReach={onReach}
        />
      )}

      <footer className="contact-card-footer">
        <label className="status-select">
          <span className="sr-only">Estado del contacto</span>
          <select className="input select input-sm" value={contact.status} disabled={saving} onChange={(e) => save(e.target.value as ContactStatus, null)}>
            {CONTACT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="ghost" icon={<NotebookPen size={15} />} onClick={() => setEditingNotes(true)}>
          Observaciones
        </Button>
      </footer>

      <Modal
        open={editingNotes}
        onClose={() => setEditingNotes(false)}
        busy={saving}
        size="sm"
        title="Observaciones"
        description={contactTitle(contact)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingNotes(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={() => save(null, notes)}>
              Guardar
            </Button>
          </>
        }
      >
        <TextArea label="Notas sobre este contacto" value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} maxLength={4000} hint="Qué respondió, cuándo volver a escribir, qué le interesa…" />
      </Modal>
    </article>
  );
}
