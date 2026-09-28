import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ExternalLink, MessageCircle, Plus, Save, ShieldCheck, Tags, X } from 'lucide-react';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Feedback';
import { TextArea, TextField } from '../../components/ui/Field';
import { Card, PageHeader } from '../../components/ui/Misc';
import { env } from '../../config/env';
import { saveSetting } from '../../services/admin';
import type { Settings } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { fillTemplate } from '../../utils/phone';

/** Ajustes generales del sistema. Solo administradores (RLS impide que otros roles los cambien). */
export function AdminSettings() {
  const { settings, reloadSettings } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState<Settings>(settings);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(settings), [settings]);

  const addCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    if (form.contact_categories.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setNewCategory('');
      return;
    }
    setForm((f) => ({ ...f, contact_categories: [...f.contact_categories, value] }));
    setNewCategory('');
  };

  const onCategoryKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cc = form.default_country_code.replace(/\D/g, '');
    if (!/^\d{1,4}$/.test(cc)) return setError('El indicativo de país debe tener entre 1 y 4 dígitos (ej. 57).');
    const hours = Math.round(Number(form.invitation_hours));
    if (!Number.isFinite(hours) || hours < 1 || hours > 336) return setError('La vigencia de los enlaces debe estar entre 1 y 336 horas (14 días).');
    if (form.whatsapp_template.length > 1000) return setError('El mensaje de WhatsApp es demasiado largo (máximo 1000 caracteres).');

    const next: Settings = { ...form, default_country_code: cc, invitation_hours: hours, whatsapp_template: form.whatsapp_template.trim() };
    const changed = (Object.keys(next) as (keyof Settings)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(settings[k]));
    if (!changed.length) {
      toast.info('No hay cambios para guardar');
      return;
    }
    setSaving(true);
    try {
      for (const key of changed) await saveSetting(key, next[key] as never);
      await reloadSettings();
      toast.success('Configuración guardada');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const preview = fillTemplate(form.whatsapp_template, { name: 'Laura', business: 'Café Aroma', employee: 'Carlos' });

  return (
    <div className="page">
      <PageHeader title="Configuración" subtitle="Ajustes generales de la plataforma. Solo los administradores pueden cambiarlos." />

      <form onSubmit={submit} className="settings-form">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="two-col">
          <Card title="Números y contactos">
            <div className="form-stack">
              <TextField
                label="Indicativo de país por defecto"
                hint="Se agrega a los números de 10 dígitos. Colombia: 57."
                inputMode="numeric"
                value={form.default_country_code}
                onChange={(e) => setForm((f) => ({ ...f, default_country_code: e.target.value }))}
                maxLength={4}
              />
              <label className="checkbox-row">
                <input type="checkbox" checked={form.allow_employee_contacts} onChange={(e) => setForm((f) => ({ ...f, allow_employee_contacts: e.target.checked }))} />
                <span>
                  <strong>Los empleados pueden registrar contactos nuevos</strong>
                  <span className="block text-mute small">Quedan asignados a quien los registra. El sistema bloquea números que ya tengan responsable.</span>
                </span>
              </label>
            </div>
          </Card>

          <Card title={<><ShieldCheck size={16} /> Invitaciones</>}>
            <TextField
              label="Vigencia de los enlaces de activación (horas)"
              hint="Pasado este tiempo el enlace deja de funcionar y hay que generar uno nuevo. Máximo 336 (14 días)."
              type="number"
              min={1}
              max={336}
              value={String(form.invitation_hours)}
              onChange={(e) => setForm((f) => ({ ...f, invitation_hours: Number(e.target.value) }))}
            />
          </Card>
        </div>

        <Card title={<><MessageCircle size={16} /> Mensaje sugerido de WhatsApp</>}>
          <div className="two-col">
            <TextArea
              label="Plantilla"
              hint="Variables disponibles: {nombre}, {empresa}, {empleado}."
              rows={5}
              value={form.whatsapp_template}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_template: e.target.value }))}
              maxLength={1000}
            />
            <div className="field">
              <span className="field-label">Vista previa</span>
              <div className="wa-preview">
                <p>{preview || <span className="text-mute">El mensaje saldrá vacío.</span>}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card title={<><Tags size={16} /> Categorías de contactos</>}>
          <div className="tag-editor">
            {form.contact_categories.map((c) => (
              <span key={c} className="tag">
                {c}
                <button
                  type="button"
                  aria-label={`Quitar ${c}`}
                  onClick={() => setForm((f) => ({ ...f, contact_categories: f.contact_categories.filter((x) => x !== c) }))}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            {!form.contact_categories.length && <span className="text-mute small">Sin categorías.</span>}
          </div>
          <div className="inline-field">
            <input className="input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={onCategoryKey} placeholder="Nueva categoría (ej. Veterinaria)" maxLength={40} aria-label="Nueva categoría" />
            <Button icon={<Plus size={16} />} onClick={addCategory}>
              Agregar
            </Button>
          </div>
          <p className="text-mute small">Quitar una categoría no modifica los contactos que ya la tienen.</p>
        </Card>

        <div className="settings-actions">
          <Button variant="ghost" onClick={() => setForm(settings)} disabled={saving}>
            Descartar cambios
          </Button>
          <Button type="submit" variant="primary" icon={<Save size={16} />} loading={saving}>
            Guardar configuración
          </Button>
        </div>
      </form>

      <Card title="Instalación" className="card-subtle">
        <dl className="data-list">
          <div>
            <dt>Base de datos (Supabase)</dt>
            <dd className="mono small">{env.supabaseUrl.replace(/^https:\/\//, '')}</dd>
          </div>
          <div>
            <dt>Página oficial</dt>
            <dd>
              <a href={env.webzipeSiteUrl} target="_blank" rel="noopener noreferrer" className="text-link">
                {env.webzipeSiteUrl} <ExternalLink size={13} />
              </a>
            </dd>
          </div>
        </dl>
        <p className="text-mute small">
          Las cuentas de administrador, las claves secretas y las funciones del servidor se gestionan desde el panel de Supabase, nunca desde esta página.
        </p>
      </Card>
    </div>
  );
}
