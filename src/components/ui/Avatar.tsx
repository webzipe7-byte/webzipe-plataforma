import { useState } from 'react';
import { initials } from '../../utils/format';

export function Avatar({ name, url, size = 36, online }: { name: string; url?: string | null; size?: number; online?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {url && !failed ? (
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
      {online !== undefined && <span className={`avatar-presence ${online ? 'is-online' : ''}`} title={online ? 'Activo recientemente' : 'Sin actividad reciente'} />}
    </span>
  );
}
