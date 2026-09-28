import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, LinkIcon, LockKeyhole } from 'lucide-react';
import { acceptInvitation, getInvitationInfo, passwordProblem, passwordStrength } from '../../services/auth';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/ui/Logo';
import { Spinner } from '../../components/ui/Spinner';
import { friendlyError } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { supabase } from '../../lib/supabase';

type Info = Awaited<ReturnType<typeof getInvitationInfo>>;

const STRENGTH = ['Muy débil', 'Aceptable', 'Buena', 'Excelente'];

export function ActivatePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('El enlace está incompleto. Ábrelo de nuevo desde el mensaje que recibiste.');
      return;
    }
    getInvitationInfo(token)
      .then(setInfo)
      .catch((err) => setLoadError(friendlyError(err)));
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password, info?.username);
    if (problem) return setError(problem);
    if (password !== confirmPassword) return setError('Las contraseñas no coinciden.');
    setSubmitting(true);
    try {
      const res = await acceptInvitation(token, password);
      // Si había otra sesión abierta en este navegador, se cierra para que el empleado ingrese con su cuenta.
      await supabase.auth.signOut({ scope: 'local' });
      setDone(res.username);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const strength = passwordStrength(password);
  const isReset = info?.purpose === 'reset';

  return (
    <div className="auth-page auth-page-single">
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-logo">
            <Logo />
          </div>

          {!info && !loadError && (
            <div className="center-row">
              <Spinner /> <span>Verificando tu enlace…</span>
            </div>
          )}

          {loadError && (
            <>
              <span className="auth-kicker is-error">
                <LinkIcon size={15} /> Enlace no válido
              </span>
              <h2>No pudimos abrir este enlace</h2>
              <p className="auth-sub">{loadError}</p>
              <Link to="/" className="btn btn-secondary btn-md btn-block">
                Ir al inicio de sesión
              </Link>
            </>
          )}

          {done && (
            <div className="activation-done">
              <CheckCircle2 size={44} className="done-icon" />
              <h2>¡Listo! Tu contraseña quedó guardada</h2>
              <p className="auth-sub">
                Ahora ingresa con tu usuario <strong>@{done}</strong> y la contraseña que acabas de crear.
              </p>
              <Link to="/" className="btn btn-primary btn-lg btn-block">
                Iniciar sesión
              </Link>
            </div>
          )}

          {info && !done && (
            <>
              <span className="auth-kicker">
                <LockKeyhole size={15} /> {isReset ? 'Nueva contraseña' : 'Activa tu cuenta'}
              </span>
              <h2>Hola, {info.full_name.split(' ')[0]}</h2>
              <p className="auth-sub">
                {isReset ? 'Crea una nueva contraseña' : 'Crea tu contraseña'} para el usuario <strong>@{info.username}</strong>. Solo tú la
                conocerás: ni el administrador puede verla.
              </p>

              {error && (
                <div className="alert alert-error" role="alert">
                  {error}
                </div>
              )}

              <form className="auth-form" onSubmit={onSubmit} noValidate>
                {/* Campo oculto para que el gestor de contraseñas asocie el usuario */}
                <input type="text" name="username" autoComplete="username" value={info.username} readOnly hidden />
                <label className="auth-field">
                  <span>Nueva contraseña</span>
                  <div className="input-icon">
                    <LockKeyhole size={18} />
                    <input
                      className="input"
                      type={show ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={72}
                      autoFocus
                    />
                    <button type="button" className="input-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                <div className="strength" aria-live="polite">
                  <div className="strength-bar">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={i < strength ? `on s${strength}` : ''} />
                    ))}
                  </div>
                  <span>{password ? STRENGTH[strength] : 'Mínimo 10 caracteres, con letras y números.'}</span>
                </div>
                <label className="auth-field">
                  <span>Repite la contraseña</span>
                  <div className="input-icon">
                    <LockKeyhole size={18} />
                    <input
                      className="input"
                      type={show ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      maxLength={72}
                    />
                  </div>
                </label>
                <Button type="submit" variant="primary" size="lg" block loading={submitting}>
                  Guardar contraseña
                </Button>
              </form>
              <p className="fine-print">Este enlace es personal, de un solo uso y vence el {formatDateTime(info.expires_at)}.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
