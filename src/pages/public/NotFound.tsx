import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Logo } from '../../components/ui/Logo';

export function NotFound() {
  return (
    <div className="standalone">
      <Logo />
      <div className="standalone-card">
        <Compass size={40} className="standalone-icon" />
        <h1>Página no encontrada</h1>
        <p>La dirección que abriste no existe o cambió.</p>
        <div className="standalone-actions">
          <Link to="/" className="btn btn-primary btn-md">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
