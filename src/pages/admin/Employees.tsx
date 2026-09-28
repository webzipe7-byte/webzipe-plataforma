import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, MoreVertical, Pencil, Power, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, OptionBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Feedback';
import { FilterSelect } from '../../components/ui/Field';
import { Card, EmptyState, ErrorState, PageHeader, SearchInput, Toolbar } from '../../components/ui/Misc';
import { SectionLoader } from '../../components/ui/Spinner';
import { EMPLOYEE_STATUS, EMPLOYEE_STATUS_OPTIONS, ROLE_OPTIONS, ROLES } from '../../config/labels';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { createInviteLink, listEmployees, type EmployeeFilters } from '../../services/employees';
import type { Employee, EmployeeStatus, Role } from '../../types/database';
import { friendlyError } from '../../utils/errors';
import { formatDate, isOnline, timeAgo } from '../../utils/format';
import { EmployeeFormModal } from './components/EmployeeFormModal';
import { InviteLinkModal, type InviteInfo } from './components/InviteLinkModal';
import { useAdminActions } from './components/useAdminActions';

/** ¿Puede el usuario actual gestionar esta cuenta? (el servidor lo vuelve a validar) */
export function canManage(me: { id: string; role: Role }, target: Employee) {
  if (me.role === 'admin') return true;
  return me.role === 'supervisor' && target.role === 'employee';
}

export function Employees() {
  const auth = useAuth();
  const me = auth.status === 'signedIn' ? auth.profile : null;
  const navigate = useNavigate();
  const toast = useToast();
  const { toggleStatus } = useAdminActions();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('active');
  const [sort, setSort] = useState<EmployeeFilters['sort']>('name');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const { data, loading, error, reload, setData } = useAsync(() => listEmployees({ search: debounced, role, status, sort }), [debounced, role, status, sort]);

  const replace = (emp: Employee) => setData((list) => (list ?? []).map((e) => (e.id === emp.id ? emp : e)));

  const generateLink = async (emp: Employee) => {
    setMenuFor(null);
    try {
      const res = await createInviteLink(emp.id);
      setInvite({ url: res.invite_url, expiresAt: res.expires_at, purpose: res.purpose, employee: emp });
    } catch (err) {
      toast.error('No se pudo generar el enlace', friendlyError(err));
    }
  };

  const onToggle = async (emp: Employee) => {
    setMenuFor(null);
    const updated = await toggleStatus(emp);
    if (updated) (status ? reload(true) : replace(updated));
  };

  const employees = data ?? [];

  return (
    <div className="page" onClick={() => menuFor && setMenuFor(null)}>
      <PageHeader
        title="Empleados"
        subtitle="Crea cuentas, edita datos, desactiva o reactiva el acceso."
        actions={
          <Button
            variant="primary"
            icon={<UserPlus size={16} />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Nuevo empleado
          </Button>
        }
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, usuario, correo o teléfono…" />
        <FilterSelect label="Rol" value={role} onChange={(v) => setRole(v as Role | '')} options={ROLE_OPTIONS} allLabel="Todos los roles" />
        <FilterSelect label="Estado" value={status} onChange={(v) => setStatus(v as EmployeeStatus | '')} options={EMPLOYEE_STATUS_OPTIONS} allLabel="Todos los estados" />
        <FilterSelect
          label="Ordenar"
          value={sort ?? 'name'}
          onChange={(v) => setSort(v as EmployeeFilters['sort'])}
          allLabel={null}
          options={[
            { value: 'name', label: 'Nombre (A–Z)' },
            { value: 'recent', label: 'Más recientes' },
            { value: 'activity', label: 'Última actividad' },
          ]}
        />
      </Toolbar>

      {error && <ErrorState message={error} onRetry={() => reload()} />}
      {loading && !data ? (
        <SectionLoader />
      ) : employees.length ? (
        <Card padded={false}>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Contacto</th>
                  <th>Ingreso</th>
                  <th>Última actividad</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const manageable = me ? canManage(me, e) : false;
                  return (
                    <tr key={e.id} className="is-clickable" onClick={() => navigate(`/admin/empleados/${e.id}`)}>
                      <td data-label="Empleado">
                        <div className="person-cell">
                          <Avatar name={e.full_name} url={e.avatar_url} size={34} online={e.status === 'active' ? isOnline(e.last_activity_at) : undefined} />
                          <div>
                            <strong>{e.full_name}</strong>
                            <span className="text-mute small">@{e.username}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Rol">
                        <OptionBadge value={e.role} map={ROLES} dot={false} />
                      </td>
                      <td data-label="Estado">
                        <div className="badge-row">
                          <OptionBadge value={e.status} map={EMPLOYEE_STATUS} />
                          {!e.password_set_at && e.status === 'active' && <Badge tone="amber">Sin activar</Badge>}
                        </div>
                      </td>
                      <td data-label="Contacto" className="small">
                        <div>{e.email}</div>
                        {e.phone && <div className="text-mute">{e.phone}</div>}
                      </td>
                      <td data-label="Ingreso" className="text-mute">
                        {formatDate(e.hire_date)}
                      </td>
                      <td data-label="Última actividad" className="text-mute">
                        {timeAgo(e.last_activity_at)}
                      </td>
                      <td className="cell-actions" onClick={(ev) => ev.stopPropagation()}>
                        {manageable && (
                          <div className="menu">
                            <Button size="sm" variant="ghost" icon={<MoreVertical size={16} />} aria-label="Acciones" onClick={() => setMenuFor(menuFor === e.id ? null : e.id)} />
                            {menuFor === e.id && (
                              <div className="menu-panel" role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setEditing(e);
                                    setFormOpen(true);
                                  }}
                                >
                                  <Pencil size={15} /> Editar
                                </button>
                                {e.status === 'active' && (
                                  <button type="button" role="menuitem" onClick={() => generateLink(e)}>
                                    <Link2 size={15} /> {e.password_set_at ? 'Enlace para nueva contraseña' : 'Nuevo enlace de activación'}
                                  </button>
                                )}
                                {e.id !== me?.id && (
                                  <button type="button" role="menuitem" className={e.status === 'active' ? 'danger' : ''} onClick={() => onToggle(e)}>
                                    <Power size={15} /> {e.status === 'active' ? 'Desactivar' : 'Reactivar'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon={<Users size={24} />} title="No hay empleados con esos filtros" action={<Button onClick={() => { setSearch(''); setRole(''); setStatus(''); }}>Limpiar filtros</Button>} />
      )}

      <EmployeeFormModal
        open={formOpen}
        employee={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(emp, inv) => {
          setFormOpen(false);
          toast.success(editing ? 'Empleado actualizado' : 'Empleado creado');
          if (inv) setInvite(inv);
          if (editing) replace(emp);
          else void reload(true);
        }}
      />
      <InviteLinkModal invite={invite} onClose={() => setInvite(null)} />
    </div>
  );
}
