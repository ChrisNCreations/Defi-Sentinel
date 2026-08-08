-- Fix infinite recursion on organization_members RLS (42P17).
-- Policies that SELECT organization_members from within organization_members
-- policies re-enter RLS evaluation and fail all authenticated reads.
-- Use SECURITY DEFINER helpers (bypass RLS) for membership/admin checks.

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.wallet_address = public.current_wallet_address()
  )
$$;

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org_id
      and m.wallet_address = public.current_wallet_address()
      and m.role = 'admin'
  )
$$;

-- Drop recursive policies
drop policy if exists "Admins can read all members in their org" on public.organization_members;
drop policy if exists "Members can list organization roster" on public.organization_members;
drop policy if exists "Admins can insert members" on public.organization_members;
drop policy if exists "Admins can update members" on public.organization_members;
drop policy if exists "Admins can delete members" on public.organization_members;

-- Recreate with security-definer helpers (no self-referential RLS)
create policy "Admins can read all members in their org"
  on public.organization_members for select
  to authenticated
  using (public.is_org_admin(organization_id));

create policy "Members can list organization roster"
  on public.organization_members for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "Admins can insert members"
  on public.organization_members for insert
  to authenticated
  with check (public.is_org_admin(organization_id));

create policy "Admins can update members"
  on public.organization_members for update
  to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy "Admins can delete members"
  on public.organization_members for delete
  to authenticated
  using (public.is_org_admin(organization_id));

-- Keep "Users can read own membership" as-is (non-recursive).
-- Grant execute on helpers to authenticated
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
