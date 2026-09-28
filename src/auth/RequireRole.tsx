import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../types/database';
import { useAuth } from './AuthProvider';
import { PageLoader } from '../components/ui/Spinner';
import { AccessDenied } from '../pages/public/AccessDenied';

/**
 * Protege rutas en la interfaz. Es una capa de experiencia de usuario:
 * la protección real de los datos la hacen RLS y las funciones del servidor,
 * así que aunque alguien manipule el JavaScript no obtiene información ajena.
 */
export function RequireRole({ roles, loginPath, children }: { roles: Role[]; loginPath: string; children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <PageLoader label="Verificando tu sesión…" />;
  if (auth.status === 'signedOut') {
    return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  }
  if (!roles.includes(auth.profile.role)) return <AccessDenied />;
  return <>{children}</>;
}
