import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { env } from '../../config/env';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/ui/Logo';
import { PageLoader } from '../../components/ui/Spinner';
import { friendlyError } from '../../utils/errors';
import type { Role } from '../../types/database';

export function homeFor(role: Role): string {
  return role === 'employee' ? '/app' : '/admin';
}

export function LoginPage({ variant = 'employee' }: { variant?: 'employee' | 'admin' }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status === 'loading') return <PageLoader label="Verificando tu sesión…" />;
  if (auth.status === 'signedIn') {
    const target = from && (auth.isStaff || !from.startsWith('/admin')) ? from : homeFor(auth.profile.role);
    return <Navigate to={target} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Escribe tu usuario y tu contraseña.');
      return;
    }
    setSubmitting(true);
    try {
      const role = await auth.signIn(username, password);
      const target = from && (role !== 'employee' || !from.startsWith('/admin')) ? from : homeFor(role);
      navigate(target, { replace: true });
    } catch (err) {
      setError(friendlyError(err));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = variant === 'admin';
  const notice = auth.status === 'signedOut' ? auth.notice : undefined;

  return (
    <div className="auth-page">
      <section className="auth-brand" aria-hidden={false}>
        <div className="auth-brand-inner">
          <Logo size="lg" />
          <h1 className="auth-headline">
            {isAdmin ? (
              <>
                Centro de <em>control</em> del equipo
              </>
            ) : (
              <>
                Tu espacio de <em>trabajo</em> en WebZipe
              </>
            )}
          </h1>
          <p className="auth-lead">
            {isAdmin
              ? 'Gestiona empleados, tareas, números y comunicaciones desde un solo lugar.'
              : 'Todo lo que tienes asignado, en un solo lugar: tareas, contactos, mensajes e instrucciones.'}
          </p>
          <ul className="auth-points">
            <li>
              <CheckCircle2 size={18} /> {isAdmin ? 'Asignación de números sin duplicados' : 'Qué hacer hoy, primero'}
            </li>
            <li>
              <CheckCircle2 size={18} /> {isAdmin ? 'Actividad del equipo en tiempo real' : 'Tus clientes y números asignados'}
            </li>
            <li>
              <CheckCircle2 size={18} /> {isAdmin ? 'Acceso protegido por roles' : 'Mensajes y novedades del equipo'}
            </li>
          </ul>
        </div>
        <div className="auth-glow" />
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-logo">
            <Logo />
          </div>
          <span className={`auth-kicker ${isAdmin ? 'is-admin' : ''}`}>
            {isAdmin ? <ShieldCheck size={15} /> : <UserRound size={15} />}
            {isAdmin ? 'Administración' : 'Empleados'}
          </span>
          <h2>{isAdmin ? 'Acceso restringido' : 'Ingresa a tu cuenta'}</h2>
          <p className="auth-sub">
            {isAdmin ? 'Solo para administradores y supervisores autorizados.' : 'Usa el usuario y la contraseña de tu cuenta de empleado.'}
          </p>

          {notice && !error && <div className="alert alert-warning">{notice}</div>}
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="auth-form" noValidate>
            <label className="auth-field">
              <span>Nombre de usuario</span>
              <div className="input-icon">
                <UserRound size={18} />
                <input
                  className="input"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="ej. maria.lopez"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={120}
                  autoFocus
                />
              </div>
            </label>
            <label className="auth-field">
              <span>Contraseña</span>
              <div className="input-icon">
                <LockKeyhole size={18} />
                <input
                  className="input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={200}
                />
                <button type="button" className="input-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <Button type="submit" variant={isAdmin ? 'gold' : 'primary'} size="lg" block loading={submitting}>
              Iniciar sesión
            </Button>
          </form>

          <div className="auth-help">
            <p>
              <KeyRound size={15} />
              <span>
                <strong>¿Primera vez?</strong> Abre el enlace de activación que te envió el administrador para crear tu contraseña.
              </span>
            </p>
            <p>
              <LockKeyhole size={15} />
              <span>
                <strong>¿Olvidaste tu contraseña?</strong> Pide al administrador un nuevo enlace.
              </span>
            </p>
          </div>

          <div className="auth-links">
            <a href={env.webzipeSiteUrl} className="text-link">
              <ArrowLeft size={15} /> Volver a WebZipe
            </a>
            {isAdmin ? (
              <a href="#/" className="text-link">
                Portal de empleados
              </a>
            ) : (
              <a href="#/admin" className="text-link muted-link">
                Administración
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
