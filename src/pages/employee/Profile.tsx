import { useState, type FormEvent } from 'react';
import { CalendarDays, Clock, ExternalLink, KeyRound, LogOut, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth, useProfile } from '../../auth/AuthProvider';
import { useWorkspace } from '../../components/layout/WorkspaceProvider';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useConfirm, useToast } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { Card, PageHeader, StatCard } from '../../components/ui/Misc';
import { env } from '../../config/env';
import { EMPLOYEE_STATUS, ROLES } from '../../config/labels';
import { updateMyProfile } from '../../services/employees';
import { friendlyError } from '../../utils/errors';
import { formatDate, formatDateTime, timeAgo } from '../../utils/format';

export function Profile() {
  const profile = useProfile();
  const { refreshProfile, signOut } = useAuth();
  const { summary } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [avatar, setAvatar] = useState(profile.avatar_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (avatar && !/^https:\/\//.test(avatar)) {
      setError('La foto debe ser un enlace que empiece por https://');
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile(phone, avatar);
      await refreshProfile();
      toast.success('Perfil actualizado');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    if (await confirm({ title: '¿Cerrar sesión?', confirmLabel: 'Cerrar sesión' })) await signOut();
  };

  return (
    <div className="page">
      <PageHeader title="Mi perfil" subtitle="Tus datos de cuenta y tu resumen de trabajo." />

      <section className="profile-hero card">
        <Avatar name={profile.full_name} url={profile.avatar_url} size={72} />
        <div className="profile-hero-info">
          <h2>{profile.full_name}</h2>
          <p className="text-mute">@{profile.username}</p>
          <div className="badge-row">
            <OptionBadge value={profile.status} map={EMPLOYEE_STATUS} />
            <OptionBadge value={profile.role} map={ROLES} dot={false} />
          </div>
        </div>
        <Button variant="ghost" icon={<LogOut size={16} />} onClick={logout} className="profile-logout">
          Cerrar sesión
        </Button>
      </section>

      <div className="stats-grid">
        <StatCard label="Tareas completadas" value={summary?.tasks_completed ?? '—'} tone="green" />
        <StatCard label="Tareas activas" value={summary ? summary.tasks_pending + summary.tasks_in_progress : '—'} tone="blue" />
        <StatCard label="Contactos asignados" value={summary?.contacts_total ?? '—'} tone="gold" />
        <StatCard label="En seguimiento" value={summary?.contacts_followup ?? '—'} tone="violet" />
      </div>

      <div className="two-col">
        <Card title="Datos de la cuenta">
          <dl className="data-list">
            <div>
              <dt>
                <UserRound size={15} /> Usuario
              </dt>
              <dd>@{profile.username}</dd>
            </div>
            <div>
              <dt>
                <Mail size={15} /> Correo
              </dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>
                <ShieldCheck size={15} /> Rol
              </dt>
              <dd>{ROLES[profile.role].label}</dd>
            </div>
            <div>
              <dt>
                <CalendarDays size={15} /> Fecha de ingreso
              </dt>
              <dd>{formatDate(profile.hire_date)}</dd>
            </div>
            <div>
              <dt>
                <Clock size={15} /> Último ingreso
              </dt>
              <dd title={formatDateTime(profile.last_login_at)}>{timeAgo(profile.last_login_at)}</dd>
            </div>
            <div>
              <dt>
                <Clock size={15} /> Última actividad
              </dt>
              <dd title={formatDateTime(profile.last_activity_at)}>{timeAgo(profile.last_activity_at)}</dd>
            </div>
          </dl>
          <p className="text-mute small">Para cambiar tu nombre, usuario o correo, pídelo al administrador.</p>
        </Card>

        <Card title="Editar mis datos">
          <form onSubmit={save} className="form-stack">
            {error && <div className="alert alert-error">{error}</div>}
            <TextField label={<><Phone size={14} /> Teléfono</>} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
            <TextField
              label="Foto (enlace de imagen)"
              hint="Opcional. Pega un enlace https:// a tu foto."
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              maxLength={500}
              placeholder="https://…"
            />
            <Button type="submit" variant="primary" loading={saving}>
              Guardar cambios
            </Button>
          </form>
          <div className="info-box">
            <KeyRound size={16} />
            <p>
              <strong>¿Quieres cambiar tu contraseña?</strong> Pide al administrador un enlace para restablecerla. Nadie más puede ver tu contraseña.
            </p>
          </div>
        </Card>
      </div>

      <Card title="WebZipe">
        <div className="webzipe-link">
          <p>Consulta la página oficial para compartir ejemplos y servicios con los clientes.</p>
          <a href={env.webzipeSiteUrl} target="_blank" rel="noopener noreferrer" className="btn btn-gold btn-md">
            <ExternalLink size={16} />
            <span>Abrir página de WebZipe</span>
          </a>
        </div>
        <Badge tone="muted">Cuenta creada {formatDate(profile.created_at)}</Badge>
      </Card>
    </div>
  );
}
