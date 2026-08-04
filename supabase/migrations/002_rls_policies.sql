-- 002_rls_policies.sql
-- Row Level Security for DeFi Sentinel

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.hard_limits enable row level security;
alter table public.circuit_breaker enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update own profile display name"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Inserts happen via service role during SIWE verify (no authenticated insert policy)

-- ---------------------------------------------------------------------------
-- organizations — members can read their org
-- ---------------------------------------------------------------------------
create policy "Members can read their organization"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organizations.id
        and m.wallet_address = public.current_wallet_address()
    )
  );

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
create policy "Users can read own membership"
  on public.organization_members for select
  to authenticated
  using (wallet_address = public.current_wallet_address());

create policy "Admins can read all members in their org"
  on public.organization_members for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members self
      where self.organization_id = organization_members.organization_id
        and self.wallet_address = public.current_wallet_address()
        and self.role = 'admin'
    )
  );

create policy "Admins can insert members"
  on public.organization_members for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.organization_members self
      where self.organization_id = organization_members.organization_id
        and self.wallet_address = public.current_wallet_address()
        and self.role = 'admin'
    )
  );

create policy "Admins can update members"
  on public.organization_members for update
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members self
      where self.organization_id = organization_members.organization_id
        and self.wallet_address = public.current_wallet_address()
        and self.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members self
      where self.organization_id = organization_members.organization_id
        and self.wallet_address = public.current_wallet_address()
        and self.role = 'admin'
    )
  );

create policy "Admins can delete members"
  on public.organization_members for delete
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members self
      where self.organization_id = organization_members.organization_id
        and self.wallet_address = public.current_wallet_address()
        and self.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- hard_limits — all members read; admins update
-- ---------------------------------------------------------------------------
create policy "Members can read hard limits"
  on public.hard_limits for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = hard_limits.organization_id
        and m.wallet_address = public.current_wallet_address()
    )
  );

create policy "Admins can update hard limits"
  on public.hard_limits for update
  to authenticated
  using (
    public.current_member_role(organization_id) = 'admin'
  )
  with check (
    public.current_member_role(organization_id) = 'admin'
  );

-- ---------------------------------------------------------------------------
-- circuit_breaker — members read; admins update (reset)
-- ---------------------------------------------------------------------------
create policy "Members can read circuit breaker"
  on public.circuit_breaker for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = circuit_breaker.organization_id
        and m.wallet_address = public.current_wallet_address()
    )
  );

create policy "Admins can update circuit breaker"
  on public.circuit_breaker for update
  to authenticated
  using (public.current_member_role(organization_id) = 'admin')
  with check (public.current_member_role(organization_id) = 'admin');

-- ---------------------------------------------------------------------------
-- audit_logs — operators & admins can SELECT only
-- Viewers must NOT read audit_logs (enforced here)
-- INSERT is granted only to service_role in 003
-- ---------------------------------------------------------------------------
create policy "Operators and admins can read audit"
  on public.audit_logs for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = audit_logs.organization_id
        and m.wallet_address = public.current_wallet_address()
        and m.role in ('operator', 'admin')
    )
  );
