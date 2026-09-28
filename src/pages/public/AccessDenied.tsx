import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/ui/Logo';

export function AccessDenied() {
  const auth = useAuth();
  return (
    <div className="standalone">
      <Logo />
      <div className="standalone-card">
        <ShieldAlert size={40} className="standalone-icon danger" />
        <h1>Acceso restringido</h1>
        <p>Tu cuenta no tiene permisos para ver esta sección. Si crees que es un error, contacta al administrador.</p>
        <div className="standalone-actions">
          <Link to="/app" className="btn btn-primary btn-md">
            Ir a mi espacio
          </Link>
          <Button variant="ghost" onClick={() => auth.signOut()}>
            Cambiar de cuenta
          </Button>
        </div>
      </div>
    </div>
  );
}
