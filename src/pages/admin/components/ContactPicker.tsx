import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useWorkspace } from '../../../components/layout/WorkspaceProvider';
import { useDebounce } from '../../../hooks/useDebounce';
import { searchContactsForSelect } from '../../../services/contacts';
import type { Contact } from '../../../types/database';
import { contactTitle } from '../../../utils/format';
import { formatPhone } from '../../../utils/phone';

/** Selector de contacto con búsqueda por nombre, empresa o número. */
export function ContactPicker({ value, onChange }: { value: Contact | null; onChange: (c: Contact | null) => void }) {
  const { settings } = useWorkspace();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const [results, setResults] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    searchContactsForSelect(debounced)
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  if (value) {
    return (
      <div className="picked">
        <div>
          <strong>{contactTitle(value)}</strong>
          <span className="text-mute mono"> {formatPhone(value.phone, settings.default_country_code)}</span>
          <span className="text-mute"> · {value.assignee?.full_name ?? 'Sin asignar'}</span>
        </div>
        <button type="button" className="icon-btn" onClick={() => onChange(null)} aria-label="Quitar contacto">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="picker">
      <div className="search-input">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar contacto por nombre, empresa o número…"
          aria-label="Buscar contacto"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="picker-list" role="listbox">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <strong>{contactTitle(c)}</strong>
                <span className="text-mute mono">{formatPhone(c.phone, settings.default_country_code)}</span>
                <span className="text-mute">{c.assignee?.full_name ?? 'Sin asignar'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
