import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { RequireRole } from './auth/RequireRole';
import { isConfigured } from './config/env';
import { FeedbackProvider } from './components/ui/Feedback';
import { PageLoader } from './components/ui/Spinner';
import { LoginPage } from './pages/public/LoginPage';
import { ActivatePage } from './pages/public/ActivatePage';
import { NotFound } from './pages/public/NotFound';
import { SetupRequired } from './pages/public/SetupRequired';
import { EmployeeLayout } from './pages/employee/EmployeeLayout';
import { EmployeeHome } from './pages/employee/EmployeeHome';
import { MyTasks } from './pages/employee/MyTasks';
import { MyContacts } from './pages/employee/MyContacts';
import { Communications } from './pages/employee/Communications';
import { Updates } from './pages/employee/Updates';
import { Profile } from './pages/employee/Profile';

// El panel de administración se descarga aparte: los empleados nunca cargan ese código.
const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, key: K) =>
  lazy(() => loader().then((m) => ({ default: m[key] })));

const AdminLayout = named(() => import('./pages/admin/AdminLayout'), 'AdminLayout');
const AdminDashboard = named(() => import('./pages/admin/AdminDashboard'), 'AdminDashboard');
const Employees = named(() => import('./pages/admin/Employees'), 'Employees');
const EmployeeDetail = named(() => import('./pages/admin/EmployeeDetail'), 'EmployeeDetail');
const AdminTasks = named(() => import('./pages/admin/AdminTasks'), 'AdminTasks');
const AdminContacts = named(() => import('./pages/admin/AdminContacts'), 'AdminContacts');
const AdminNumbers = named(() => import('./pages/admin/AdminNumbers'), 'AdminNumbers');
const AdminCommunications = named(() => import('./pages/admin/AdminCommunications'), 'AdminCommunications');
const AdminAnnouncements = named(() => import('./pages/admin/AdminAnnouncements'), 'AdminAnnouncements');
const AdminActivity = named(() => import('./pages/admin/AdminActivity'), 'AdminActivity');
const AdminSettings = named(() => import('./pages/admin/AdminSettings'), 'AdminSettings');

const Lazy = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

export function App() {
  if (!isConfigured) return <SetupRequired />;

  return (
    // HashRouter: funciona en GitHub Pages (hosting estático) sin reglas de reescritura.
    <HashRouter>
      <FeedbackProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/admin/login" element={<LoginPage variant="admin" />} />
            <Route path="/activar" element={<ActivatePage />} />

            <Route
              path="/app"
              element={
                <RequireRole roles={['employee', 'supervisor', 'admin']} loginPath="/">
                  <EmployeeLayout />
                </RequireRole>
              }
            >
              <Route index element={<EmployeeHome />} />
              <Route path="tareas" element={<MyTasks />} />
              <Route path="contactos" element={<MyContacts />} />
              <Route path="comunicaciones" element={<Communications />} />
              <Route path="actualizaciones" element={<Updates />} />
              <Route path="perfil" element={<Profile />} />
            </Route>

            <Route
              path="/admin"
              element={
                <RequireRole roles={['supervisor', 'admin']} loginPath="/admin/login">
                  <Lazy>
                    <AdminLayout />
                  </Lazy>
                </RequireRole>
              }
            >
              <Route index element={<Lazy><AdminDashboard /></Lazy>} />
              <Route path="empleados" element={<Lazy><Employees /></Lazy>} />
              <Route path="empleados/:id" element={<Lazy><EmployeeDetail /></Lazy>} />
              <Route path="tareas" element={<Lazy><AdminTasks /></Lazy>} />
              <Route path="contactos" element={<Lazy><AdminContacts /></Lazy>} />
              <Route path="numeros" element={<Lazy><AdminNumbers /></Lazy>} />
              <Route path="comunicaciones" element={<Lazy><AdminCommunications /></Lazy>} />
              <Route path="actualizaciones" element={<Lazy><AdminAnnouncements /></Lazy>} />
              <Route path="actividad" element={<Lazy><AdminActivity /></Lazy>} />
              <Route
                path="configuracion"
                element={
                  <RequireRole roles={['admin']} loginPath="/admin/login">
                    <Lazy>
                      <AdminSettings />
                    </Lazy>
                  </RequireRole>
                }
              />
            </Route>

            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </FeedbackProvider>
    </HashRouter>
  );
}
