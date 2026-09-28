import { useEffect, useState, type FormEvent } from 'react';
import { Eye, Megaphone, Pencil, Pin, Plus, Trash2 } from 'lucide-react';
import { OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm, useToast } from '../../components/ui/Feedback';
import { FilterSelect, SelectField, TextArea, TextField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorState, PageHeader, Toolbar } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { ANNOUNCEMENT_CATEGORY, ANNOUNCEMENT_CATEGORY_OPTIONS } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncementsAdmin,
  updateAnnouncement,
  type AnnouncementInput,
} from '../../services/communications';
import { listActiveEmployees } from '../../services/employees';
import type { Announcement, AnnouncementCategory } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { formatDateTime, timeAgo } from '../../utils/format';

type Row = Announcement & { reads: { count: number }[] };

export function AdminAnnouncements() {
  const toast = useToast();
  const confirm = useConfirm();
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const { data, loading, error, reload } = useAsync(() => Promise.all([listAnnouncementsAdmin(), listActiveEmployees()]), []);

  const rows = (data?.[0] ?? []).filter((a) => !category || a.category === category);
  const activeCount = data?.[1].length ?? 0;

  const remove = async (a: Row) => {
    if (!(await confirm({ title: '¿Eliminar esta actualización?', message: `«${a.title}» dejará de aparecer para todos los empleados.`, confirmLabel: 'Eliminar', danger: true }))) return;
    try {
      await deleteAnnouncement(a.id);
      toast.success('Actualización eliminada');
      void reload(true);
    } catch (err) {
      toast.error('No se pudo eliminar', friendlyError(err));
    }
  };

  const togglePin = async (a: Row) => {
    try {
      await updateAnnouncement(a.id, { title: a.title, body: a.body, category: a.category, pinned: !a.pinned });
      void reload(true);
    } catch (err) {
      toast.error('No se pudo actualizar', friendlyError(err));
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Actualizaciones"
        subtitle="Publica instrucciones, cambios de proceso, campañas o novedades. Todos los empleados las ven en su portal y reciben un aviso."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Publicar actualización
          </Button>
        }
      />

      <Toolbar>
        <FilterSelect label="Categoría" value={category} onChange={setCategory} options={ANNOUNCEMENT_CATEGORY_OPTIONS} allLabel="Todas las categorías" />
      </Toolbar>

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : rows.length ? (
        <div className="announcement-list">
          {rows.map((a) => {
            const reads = a.reads?.[0]?.count ?? 0;
            return (
              <article key={a.id} className={`announcement ${a.pinned ? 'is-pinned' : ''}`}>
                <header>
                  <div className="announcement-tags">
                    {a.pinned && (
                      <span className="pin-tag">
                        <Pin size={13} /> Fijada
                      </span>
                    )}
                    <OptionBadge value={a.category} map={ANNOUNCEMENT_CATEGORY} dot={false} />
                  </div>
                  <time title={formatDateTime(a.published_at)}>{timeAgo(a.published_at)}</time>
                </header>
                <h2>{a.title}</h2>
                <p className="pre-line">{a.body}</p>
                <footer>
                  <span className="text-mute small">
                    Por {a.author_name} · <Eye size={13} /> Leída por {reads}
                    {activeCount ? ` de ${activeCount}` : ''}
                  </span>
                  <div className="task-buttons">
                    <Button size="sm" variant="ghost" icon={<Pin size={15} />} onClick={() => togglePin(a)}>
                      {a.pinned ? 'Desfijar' : 'Fijar'}
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Pencil size={15} />} aria-label="Editar" title="Editar" onClick={() => setEditing(a)} />
                    <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label="Eliminar" title="Eliminar" onClick={() => remove(a)} />
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Megaphone size={24} />}
          title={category ? 'No hay actualizaciones en esta categoría' : 'Aún no hay actualizaciones'}
          action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>Publicar la primera</Button>}
        >
          Úsalas para nuevas instrucciones, cambios en campañas o herramientas.
        </EmptyState>
      )}

      <AnnouncementModal
        announcement={editing}
        onClose={() => setEditing(null)}
        onSaved={(isNew) => {
          setEditing(null);
          toast.success(isNew ? 'Actualización publicada' : 'Actualización guardada', isNew ? 'Los empleados ya pueden verla.' : undefined);
          void reload(true);
        }}
      />
    </div>
  );
}

const EMPTY: AnnouncementInput = { title: '', body: '', category: 'general', pinned: false };

function AnnouncementModal({ announcement, onClose, onSaved }: { announcement: Row | 'new' | null; onClose: () => void; onSaved: (isNew: boolean) => void }) {
  const [form, setForm] = useState<AnnouncementInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = announcement === 'new';

  useEffect(() => {
    if (!announcement) return;
    setError(null);
    setForm(announcement === 'new' ? EMPTY : { title: announcement.title, body: announcement.body, category: announcement.category, pinned: announcement.pinned });
  }, [announcement]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 3) return setError('El título debe tener al menos 3 caracteres.');
    if (!form.body.trim()) return setError('Escribe el contenido de la actualización.');
    setSaving(true);
    setError(null);
    try {
      const input = { ...form, title: form.title.trim(), body: form.body.trim() };
      if (announcement === 'new') await createAnnouncement(input);
      else if (announcement) await updateAnnouncement(announcement.id, input);
      onSaved(isNew);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!announcement}
      onClose={onClose}
      busy={saving}
      size="lg"
      title={isNew ? 'Publicar actualización' : 'Editar actualización'}
      description={isNew ? 'Todos los empleados activos la verán en su portal como «no leída».' : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="announcement-form" loading={saving} icon={<Megaphone size={16} />}>
            {isNew ? 'Publicar' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <form id="announcement-form" className="form-grid" onSubmit={submit} noValidate>
        {error && <div className="alert alert-error span-2">{error}</div>}
        <TextField label="Título" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={160} fieldClassName="span-2" placeholder="Ej. Nuevo guion para el primer mensaje" />
        <SelectField
          label="Categoría"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AnnouncementCategory }))}
          options={ANNOUNCEMENT_CATEGORY_OPTIONS}
        />
        <label className="checkbox-row align-end">
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} />
          <span>
            <strong>Fijar arriba</strong> — aparece destacada en el inicio de cada empleado.
          </span>
        </label>
        <TextArea label="Contenido" required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={9} maxLength={10000} fieldClassName="span-2" />
      </form>
    </Modal>
  );
}
