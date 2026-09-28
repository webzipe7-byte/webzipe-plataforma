import { Settings2 } from 'lucide-react';
import { Logo } from '../../components/ui/Logo';

/** Se muestra si faltan las variables de entorno: no hay datos falsos de respaldo. */
export function SetupRequired() {
  return (
    <div className="standalone">
      <Logo />
      <div className="standalone-card">
        <Settings2 size={40} className="standalone-icon" />
        <h1>Falta conectar la base de datos</h1>
        <p>
          Esta instalación no tiene configuradas las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Crea el
          archivo <code>.env.local</code> (o los secretos del despliegue) siguiendo el README y vuelve a compilar.
        </p>
      </div>
    </div>
  );
}
