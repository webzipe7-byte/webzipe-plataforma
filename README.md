# WebZipe · Plataforma interna

Portal de empleados y panel de administración de WebZipe, conectados a **una sola base de datos**.

- **Portal de empleados** (`/#/`): cada trabajador entra con su usuario y contraseña y ve *solo* lo suyo: tareas, contactos/números, mensajes, actualizaciones y su perfil.
- **Panel de administración** (`/#/admin`): solo para `admin` y `supervisor`. Empleados, tareas, contactos, control de números, comunicaciones, actualizaciones, actividad y configuración.

---

## 1. Arquitectura y por qué Supabase

GitHub Pages solo sirve archivos estáticos: **no puede** guardar contraseñas, validar sesiones ni proteger datos. Por eso el sistema se divide así:

| Capa | Tecnología | Responsabilidad |
|---|---|---|
| Interfaz | React + TypeScript (Vite), publicada en GitHub Pages | Pantallas. No contiene secretos ni decide permisos. |
| Autenticación | Supabase Auth | Contraseñas con **bcrypt**, sesiones JWT que expiran y se renuevan. |
| Base de datos | PostgreSQL (Supabase) | Datos reales y persistentes para todos los usuarios. |
| Permisos | **Row Level Security** (RLS) + funciones SQL | La base de datos decide qué filas puede ver o cambiar cada usuario. Aunque alguien manipule el JavaScript, no obtiene datos ajenos. |
| Operaciones sensibles | Edge Functions (Deno) | Login por usuario, crear empleados, enlaces de activación. Usan la clave secreta **solo en el servidor**. |
| Tiempo real | Supabase Realtime | Notificaciones de mensajes, actualizaciones y tareas nuevas. |

Se eligió Supabase frente a Firebase porque ofrece PostgreSQL relacional (relaciones y restricciones reales: un número = un responsable), políticas RLS escritas en SQL y comprobables con pruebas automáticas, y un plan gratuito suficiente para empezar que escala a muchos empleados.

### Flujo de datos

```
Navegador (GitHub Pages)
   │  clave pública "anon" + sesión JWT del usuario
   ▼
Supabase ──► RLS: ¿quién eres? ¿qué rol tienes? ¿esta fila es tuya?
   │
   ├─ Tablas (employees, tasks, contacts, assignments, messages…)
   ├─ Funciones SQL (assign_contact, update_task_status, send_message…)
   └─ Edge Functions (auth-login, invitation, admin-employees) ← clave secreta solo aquí
```

---

## 2. Estructura de archivos

```
plataforma webzipe/
├── index.html                  Página base (sin indexar en buscadores)
├── vite.config.ts              Build + Content-Security-Policy de producción
├── .env.example                Plantilla de variables de entorno
├── .github/workflows/deploy.yml  Publicación automática en GitHub Pages
├── public/favicon.svg
├── scripts/                    Se ejecutan en TU computador (usan la clave secreta)
│   ├── create-admin.mjs        Crea el primer administrador
│   ├── seed-dev.mjs            Datos de prueba marcados (DEV) / --clean para borrarlos
│   └── _admin-client.mjs
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260927000001_schema.sql     Tablas, tipos, índices
│   │   ├── 20260927000002_functions.sql  Lógica: asignaciones, tareas, mensajes, historial
│   │   └── 20260927000003_rls.sql        Políticas de seguridad y Realtime
│   └── functions/
│       ├── auth-login/         Login por usuario + bloqueo tras 5 intentos fallidos
│       ├── invitation/         Activar cuenta / restablecer contraseña con enlace
│       ├── admin-employees/    Crear, editar, desactivar empleados y generar enlaces
│       └── _shared/
├── tests/db/                   Pruebas de seguridad (Postgres embebido, sin internet)
└── src/
    ├── main.tsx, App.tsx       Arranque y rutas protegidas
    ├── auth/                   Sesión (AuthProvider) y protección por rol (RequireRole)
    ├── config/                 Variables públicas y etiquetas de estados
    ├── lib/supabase.ts         Cliente de Supabase
    ├── services/               Acceso a datos (empleados, tareas, contactos, comunicaciones…)
    ├── hooks/                  useAsync, useRealtime, useDebounce
    ├── utils/                  Formato de fechas, teléfonos, errores, búsqueda
    ├── components/
    │   ├── ui/                 Botones, badges, modales, formularios, notificaciones
    │   ├── layout/             Estructura (menú lateral / inferior) y estado compartido
    │   └── domain/             Tarjetas de tarea y contacto, WhatsApp, verificar número
    ├── pages/
    │   ├── public/             Login, activación, acceso denegado, 404
    │   ├── employee/           Inicio, Mis tareas, Mis contactos, Comunicaciones, Actualizaciones, Perfil
    │   └── admin/              Dashboard, Empleados, Tareas, Contactos, Números, Comunicaciones,
    │                           Actualizaciones, Actividad, Configuración
    ├── styles/                 tokens, base, layout, componentes y páginas (identidad WebZipe)
    └── types/database.ts
```

### Tablas

| Tabla | Contenido |
|---|---|
| `auth.users` | Cuentas y **hash** de contraseña (gestionado por Supabase Auth). Equivale a *users*. |
| `roles` | admin, supervisor, employee |
| `employees` | Perfil 1:1 con cada cuenta: nombre, usuario, correo, teléfono, rol, estado, fechas |
| `employee_notes` | Notas internas sobre el empleado (solo staff) |
| `employee_groups`, `employee_group_members` | Grupos para mensajes |
| `contacts` | Clientes/prospectos. **El número es único**: cada número existe una sola vez |
| `assignments` | Historial de asignaciones de números (quién, a quién, cuándo, liberación y motivo) |
| `tasks` | Tareas con cliente, teléfono, fechas, prioridad, estado y nota del empleado |
| `messages`, `message_recipients` | Mensajes y estado leído/no leído por destinatario |
| `announcements`, `announcement_reads` | Actualizaciones y lecturas |
| `activity_logs` | Historial de actividad (lo escriben solo los triggers/funciones, nunca el navegador) |
| `invitations` | Enlaces de activación (se guarda solo el hash del token, un solo uso, con vencimiento) |
| `login_attempts` | Control de intentos fallidos de inicio de sesión |
| `settings` | Configuración general |

---

## 3. Configurar la base de datos (una sola vez)

1. Crea un proyecto en [supabase.com](https://supabase.com) (región más cercana, p. ej. São Paulo).
2. **Aplica las migraciones**, en orden. Opción A (sin instalar nada): en *SQL Editor* pega y ejecuta el contenido de
   `001_schema.sql`, luego `002_functions.sql`, luego `003_rls.sql`.
   Opción B (CLI):
   ```bash
   npx supabase login
   ```
   ```bash
   npx supabase link --project-ref TU-PROJECT-REF
   ```
   ```bash
   npx supabase db push
   ```
3. **Ajustes de Auth** (*Authentication → Sign In / Providers*):
   - Desactiva **Allow new users to sign up** (nadie se registra solo; las cuentas las crea un administrador).
   - No hace falta tocar **Confirm email**: las cuentas se crean ya confirmadas desde el servidor.
   - En *Authentication → URL Configuration*, pon como **Site URL** la dirección pública de la plataforma.
4. **Despliega las Edge Functions** (requiere la CLI enlazada del paso 2):
   ```bash
   npx supabase functions deploy auth-login --no-verify-jwt
   ```
   ```bash
   npx supabase functions deploy invitation --no-verify-jwt
   ```
   ```bash
   npx supabase functions deploy admin-employees --no-verify-jwt
   ```
   (`--no-verify-jwt` es intencional: `auth-login` e `invitation` son públicas, y `admin-employees` valida la sesión y el rol dentro del código.)
5. **Secretos de las funciones** (*Edge Functions → Secrets*, o con la CLI):
   ```bash
   npx supabase secrets set APP_URL=https://webzipe7-byte.github.io/webzipe-plataforma/ ALLOWED_ORIGINS=https://webzipe7-byte.github.io
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya existen automáticamente dentro de las funciones.

---

## 4. Variables de entorno

Copia `.env.example` como `.env.local` (este archivo **no** se sube a GitHub).

| Variable | Dónde | Pública | Para qué |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` y secreto de GitHub | Sí | Dirección del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` y secreto de GitHub | Sí (por diseño; RLS protege los datos) | Clave pública *anon / publishable* |
| `VITE_WEBZIPE_SITE_URL` | `.env.local` / variable de GitHub | Sí | Botón «Ir a WebZipe» |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo** `.env.local` en tu PC | **NO** | Scripts `create-admin` y `seed:dev`. Nunca en variables `VITE_` ni en GitHub |
| `APP_URL` | `.env.local` y secreto de Edge Functions | — | Dirección pública para los enlaces de activación |
| `ALLOWED_ORIGINS` | secreto de Edge Functions | — | Dominios autorizados a llamar a las funciones (CORS) |
| `DEV_EMAIL_DOMAIN` | `.env.local` | — | Correos de las cuentas de prueba |

Si faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, la aplicación muestra «Falta conectar la base de datos» en vez de funcionar con datos falsos.

---

## 5. Crear el primer administrador

Con `.env.local` completo (incluida `SUPABASE_SERVICE_ROLE_KEY`):

```bash
npm install
```
```bash
npm run create-admin -- --name "Jonathan Pérez" --username jonathan --email webzipe7@gmail.com
```

El script imprime un **enlace de activación**. Ábrelo, crea tu contraseña y entra por `/#/admin`. Nadie (ni el script) conoce tu contraseña.

## 6. Crear empleados

*Panel → Empleados → Nuevo empleado*: nombre completo, usuario, correo, teléfono, rol, fecha de ingreso y notas.
Al guardar aparece el **enlace de invitación** con botones para enviarlo por WhatsApp o correo.
Desde la ficha del empleado puedes editarlo, desactivarlo/reactivarlo (con confirmación, y opción de liberar sus números), generar un nuevo enlace o enviarle un mensaje.

> **Supervisores:** pueden gestionar empleados con rol *empleado*, tareas, contactos y comunicaciones. No pueden crear administradores ni cambiar la configuración.

## 7. Cómo el empleado crea su contraseña

1. Abre el enlace (`/#/activar?token=…`). Es personal, **de un solo uso** y vence (72 h por defecto, configurable).
2. Escribe su contraseña dos veces (mínimo 10 caracteres, letras y números). Supabase la guarda con **bcrypt**; nunca en texto plano.
3. Entra por la página principal con su **usuario** y contraseña.

¿Olvidó la contraseña? El administrador genera un enlace nuevo desde la ficha del empleado; el anterior deja de funcionar.

## 8. Asignar contactos y números

*Panel → Contactos*:
- **Nuevo contacto**: al escribir el teléfono se verifica si ya existe o está asignado.
- **Importar**: pega o carga un CSV (`teléfono, negocio, nombre, categoría, ciudad, observaciones`). Detecta duplicados e inválidos y puede asignar todo a un empleado.
- Selecciona uno o varios → **Asignar**. Si un número ya pertenece a otra persona, el sistema lo advierte y pide confirmación para reasignarlo.

*Panel → Números*: quién tiene cada número, desde cuándo y quién lo asignó; **liberar**, **reasignar** e **historial** completo.
Si un empleado intenta registrar un número ya asignado, se bloquea con el aviso «Este número ya está asignado a otro empleado» y queda registrado en *Actividad*.

## 9. Asignar tareas

*Panel → Tareas → Nueva tarea* (o desde la ficha de un empleado o un contacto): nombre, descripción, empleado, cliente/contacto, teléfono, fecha límite y prioridad. Si ya existe una tarea abierta igual para ese empleado, se avisa.
El empleado cambia el estado (Pendiente → En proceso → Completada / Pausada) y puede dejar una nota. El administrador lo ve al instante en Tareas y en el Dashboard.

## 10. Comunicaciones y actualizaciones

- *Panel → Comunicaciones*: mensaje a **todos**, a un **grupo** o a **un empleado**. Se ve quién lo leyó. Los grupos se crean en la pestaña *Grupos de empleados*.
- *Panel → Actualizaciones → Publicar*: título, categoría (instrucciones, proceso, clientes, campañas, herramientas, importante, página de WebZipe) y opción **Fijar**. Los empleados las ven como «no leídas», reciben un aviso en pantalla y pueden marcarlas leídas / no leídas.

---

## 11. Desplegar

1. Crea un repositorio nuevo, por ejemplo `webzipe-plataforma`, y sube esta carpeta (el `.gitignore` ya excluye `.env.local`).
2. En GitHub → *Settings → Secrets and variables → Actions*: agrega los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (y opcionalmente la variable `VITE_WEBZIPE_SITE_URL`).
3. *Settings → Pages → Source*: **GitHub Actions**.
4. Cada `push` a `main` ejecuta las pruebas de seguridad, compila y publica en `https://webzipe7-byte.github.io/webzipe-plataforma/`.
5. Actualiza `APP_URL` y `ALLOWED_ORIGINS` de las Edge Functions con esa dirección (paso 3.5).
6. Opcional: en la página principal de WebZipe, agrega un enlace «Empleados» hacia esa dirección.

Desarrollo local:

```bash
npm run dev
```

---

## 12. Seguridad y verificación

| Requisito | Cómo se cumple |
|---|---|
| Contraseñas hasheadas | Supabase Auth (bcrypt). No existe ninguna columna de contraseña en tablas propias. |
| Sin credenciales en el frontend | Solo la clave pública *anon*. La clave secreta vive en las Edge Functions y en tu `.env.local`. |
| Autenticación y sesiones | JWT de 1 h con renovación automática; cierre por inactividad (12 h); botón de cerrar sesión con confirmación. |
| Fuerza bruta | 5 intentos fallidos bloquean ese usuario 15 min. Mensaje genérico «Usuario o contraseña incorrectos». |
| Autorización por rol | RLS en todas las tablas + funciones que verifican el rol. Las rutas protegidas de la interfaz son solo una capa visual adicional. |
| Empleado ≠ datos de otros | RLS: solo ve sus tareas, sus contactos, sus mensajes y su perfil. |
| Empleado ≠ panel admin | `/admin` exige rol staff en la interfaz **y** en la base de datos; sin sesión redirige a `/#/admin/login`. |
| Cuentas desactivadas | Pierden el acceso de inmediato (RLS verifica el estado en cada consulta). |
| Historial inalterable | `activity_logs` solo lo escriben triggers/funciones; nadie puede insertarlo ni editarlo desde el navegador. |
| Cabeceras | CSP estricta en producción, `noindex`, `no-referrer`. |

**Pruebas automáticas** (se ejecutan también antes de cada despliegue):

```bash
npm run test:db
```

Levantan un PostgreSQL embebido con las migraciones reales y comprueban 34 casos, entre ellos:
un empleado no ve tareas, contactos, mensajes ni actividad de otro; no puede cambiarse el rol; no puede usar funciones de administración; un visitante sin sesión no lee nada; una cuenta desactivada pierde el acceso; las tareas y contactos se guardan y el administrador ve los cambios; verificar un número ajeno avisa sin revelar el dueño.

```bash
npm run typecheck
```

## 13. Datos de prueba

```bash
npm run seed:dev
```

Crea cuentas y datos marcados **(DEV)** / **[DEV]** con números de prueba (prefijo 555) e imprime sus enlaces de activación (no hay contraseñas en el código). Para borrarlos:

```bash
npm run seed:dev -- --clean
```

No ejecutes `seed:dev` en el proyecto de producción.

## 14. Limitaciones conocidas

- **Envío de invitaciones:** el enlace se comparte por WhatsApp o correo desde los botones del panel (se abre tu app de WhatsApp/correo). El sistema no envía correos automáticamente; para eso se puede conectar un proveedor SMTP a Supabase más adelante.
- **Foto de perfil:** se indica con un enlace `https://` a una imagen; no hay subida de archivos todavía (se puede añadir con Supabase Storage).
- **WhatsApp:** el botón abre `wa.me` con un mensaje sugerido; el envío lo hace el empleado desde su WhatsApp. No hay integración con la API de WhatsApp Business.
- **Notificaciones:** son en pantalla y en tiempo real mientras la plataforma está abierta; no hay notificaciones push al teléfono.
