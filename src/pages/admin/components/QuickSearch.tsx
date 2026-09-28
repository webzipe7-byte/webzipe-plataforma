import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, UserRound, Users } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { OptionBadge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';
import { useWorkspace } from '../../../components/layout/WorkspaceProvider';
import { CONTACT_STATUS, EMPLOYEE_STATUS, TASK_STATUS } from '../../../config/labels';
import { useDebounce } from '../../../hooks/useDebounce';
import { listContacts } from '../../../services/contacts';
import { listEmployees } from '../../../services/employees';
import { listTasks } from '../../../services/tasks';
import type { Contact, Employee, Task } from '../../../types/database';
import { contactTitle } from '../../../utils/format';
import { formatPhone } from '../../../utils/phone';

type Results = { employees: Employee[]; contacts: Contact[]; tasks: Task[] };

/** Búsqueda rápida global (Ctrl/Cmd + K): empleados, contactos, números y tareas. */
export function QuickSearch() {
  const navigate = useNavigate();
  const { settings } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 250);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listEmployees({ search: debounced }),
      listContacts({ search: debounced, pageSize: 6 }),
      listTasks({ search: debounced, pageSize: 5, sort: 'recent' }),
    ])
      .then(([employees, contacts, tasks]) => {
        if (!cancelled) setResults({ employees: employees.slice(0, 5), contacts: contacts.rows, tasks: tasks.rows });
      })
      .catch(() => !cancelled && setResults({ employees: [], contacts: [], tasks: [] }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  const total = results ? results.employees.length + results.contacts.length + results.tasks.length : 0;

  return (
    <>
      <button type="button" className="quick-search-trigger" onClick={() => setOpen(true)}>
        <Search size={16} />
        <span>Buscar…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <button type="button" className="icon-btn quick-search-icon" onClick={() => setOpen(true)} aria-label="Buscar">
        <Search size={20} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Búsqueda rápida" description="Busca por nombre, teléfono, empresa, empleado o tarea." size="md">
        <div className="search-input search-input-lg">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej. 300 123 4567, Café Aroma, María…" aria-label="Buscar" autoFocus />
          {loading && <Spinner size={16} />}
        </div>

        {results && total === 0 && !loading && <p className="text-mute center pad">Sin resultados para «{debounced}».</p>}

        {results && total > 0 && (
          <div className="quick-results">
            {results.employees.length > 0 && (
              <div className="quick-group">
                <h3>
                  <UserRound size={14} /> Empleados
                </h3>
                {results.employees.map((e) => (
                  <button key={e.id} type="button" className="quick-item" onClick={() => go(`/admin/empleados/${e.id}`)}>
                    <span>
                      <strong>{e.full_name}</strong> <span className="text-mute">@{e.username}</span>
                    </span>
                    <OptionBadge value={e.status} map={EMPLOYEE_STATUS} />
                  </button>
                ))}
              </div>
            )}
            {results.contacts.length > 0 && (
              <div className="quick-group">
                <h3>
                  <Users size={14} /> Contactos y números
                </h3>
                {results.contacts.map((c) => (
                  <button key={c.id} type="button" className="quick-item" onClick={() => go(`/admin/contactos?q=${encodeURIComponent(c.phone)}`)}>
                    <span>
                      <strong>{contactTitle(c)}</strong>{' '}
                      <span className="text-mute mono">{formatPhone(c.phone, settings.default_country_code)}</span>
                      <span className="text-mute"> · {c.assignee?.full_name ?? 'Sin asignar'}</span>
                    </span>
                    <OptionBadge value={c.status} map={CONTACT_STATUS} />
                  </button>
                ))}
              </div>
            )}
            {results.tasks.length > 0 && (
              <div className="quick-group">
                <h3>
                  <ClipboardList size={14} /> Tareas
                </h3>
                {results.tasks.map((t) => (
                  <button key={t.id} type="button" className="quick-item" onClick={() => go(`/admin/tareas?q=${encodeURIComponent(t.title)}`)}>
                    <span>
                      <strong>{t.title}</strong> <span className="text-mute">· {t.assignee?.full_name}</span>
                    </span>
                    <OptionBadge value={t.status} map={TASK_STATUS} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
