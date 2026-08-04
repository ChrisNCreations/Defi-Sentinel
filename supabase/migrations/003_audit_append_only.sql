-- 003_audit_append_only.sql
-- Explicitly revoke UPDATE/DELETE on audit_logs for all app roles.
-- Agent (service_role) may INSERT only.

-- No UPDATE/DELETE policies exist on audit_logs (see 002).
-- Extra defense: revoke table privileges that would allow mutations.

revoke update, delete on table public.audit_logs from authenticated;
revoke update, delete on table public.audit_logs from anon;
revoke update, delete on table public.audit_logs from public;

-- Authenticated users only need SELECT (via RLS policy for operator/admin)
grant select on table public.audit_logs to authenticated;

-- service_role bypasses RLS but we still restrict DML at privilege level
revoke update, delete on table public.audit_logs from service_role;
grant insert, select on table public.audit_logs to service_role;

-- Block UPDATE/DELETE via trigger as last-resort defense even for table owners
create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: % not allowed', tg_op;
end;
$$;

drop trigger if exists trg_audit_no_update on public.audit_logs;
create trigger trg_audit_no_update
  before update on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

drop trigger if exists trg_audit_no_delete on public.audit_logs;
create trigger trg_audit_no_delete
  before delete on public.audit_logs
  for each row execute function public.prevent_audit_mutation();

comment on function public.prevent_audit_mutation is
  'Hard block UPDATE/DELETE on audit_logs for all roles including service_role.';
