-- =====================================================================
-- WebZipe · Plataforma interna de empleados
-- 004 · Privilegios explícitos
--
-- Los proyectos nuevos de Supabase ya no conceden privilegios por defecto
-- sobre las tablas de "public". Aquí se conceden de forma explícita y se
-- vuelven a aplicar las restricciones de 003 (RLS sigue siendo la capa
-- principal). Es idempotente: se puede ejecutar más de una vez.
-- =====================================================================

grant usage on schema public to authenticated, service_role;

-- Service role (Edge Functions y scripts del servidor): acceso completo.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Usuarios con sesión: lectura/escritura base; RLS decide qué filas.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Mismas restricciones que 003 (se repiten porque los grants anteriores las anulan).
revoke all on public.invitations, public.login_attempts from authenticated;

revoke insert, update, delete, truncate on
  public.roles, public.employees, public.assignments, public.activity_logs,
  public.messages, public.message_recipients, public.announcement_reads
from authenticated;

revoke insert, delete on public.settings from authenticated;

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Visitantes sin sesión: nada.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
